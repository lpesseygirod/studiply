import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { a11yState } from '../../utils/a11y';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useConnectivity } from '../../lib/connectivity';
import { chosenLectures, countsLine, planInputFor, quizTitle, suggestedMinutes, type MaterialLecture, type QuizMaterial } from '../../lib/quiz/panel';
import { libraryTitle, uploadKindOf, uploadLibraryFile } from '../../services/library-upload.service';
import { createQuiz, lastQuizCourse, loadQuizMaterial, pastExamFormat, quizCourses, saveQuizDefaults, startQuiz, type QuizCourse } from '../../services/quiz.service';
import { ConsentDeclinedError } from '../../services/consent.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { errorMessage } from '../../utils/errors';
import {
  countValueFor,
  mergeFormats,
  planQuiz,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  QUIZ_PRESETS,
  QUIZ_SLIDER_KEYS,
  type PastExamFormatRead,
  type QuestionType,
  type QuizPlan,
  type QuizSliderKey,
  type QuizSliders,
} from '../../../supabase/functions/_shared/quiz-plan';
import { DEFAULT_CHOICES, QUIZ_LANGUAGES, SETTINGS_VERSION, settingsProblem, type QuizChoices, type QuizSettings } from '../../../supabase/functions/_shared/quiz-settings';
import { showAlert } from '../dialogs/dialogs';
import { AddButton, CheckBox, PresetChip, ResourceCard, ResourceRow, SliderRow } from '../panel/PanelParts';
import { makePanelStyles } from '../panel/panelStyles';
import { closeNewQuiz, useNewQuizPanel, type NewQuizRequest } from './newQuizState';
import { kindLabel, QUIZ_PRESET_ORDER, QUIZ_SLIDER_LABELS, TYPE_CHIPS } from './quizLabels';

/**
 * New quiz (step 9.1b-1; BUILD-PLAN "Create a quiz"), opened from Review → Quiz me. The summarize
 * panel's frame (docs/design desktop-02 on the laptop, iphone-05's full-screen sheet on the iPhone and
 * the web below 1024 px), its slider rows, presets, resource rows and footer (components/panel):
 * - What it covers: the course, then the topic (the whole course, or lectures and folders).
 * - Resources: My notes and marks (always), the lectures' summaries and their slides and photos,
 *   files added from the library or uploaded (they become files of the course).
 * - Example quizzes or past exams: they set the quiz's format. Step 9.1b-2: each one's format is read
 *   when it is added (once per file, after the permission it needs): its line shows its length and
 *   types, Number of questions moves to its length, and the preview follows its mix.
 * - The 10 sliders, presets and Save as course default; the choices.
 * - The calculator's preview line (quiz-plan.ts); Create quiz saves the quiz (pending) with its
 *   settings and plan, then (9.1b-2) starts the quiz function, which writes it in the background
 *   (Review → Quiz me follows it).
 * Making a quiz needs a connection.
 */
export function NewQuizPanel() {
  const request = useNewQuizPanel();
  if (!request) return null;
  return <Panel key={request.at} request={request} />;
}

type Role = 'resource' | 'pastExam';
const LIMIT_KINDS: { key: QuizChoices['timeLimit']['kind']; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'total', label: 'Total' },
  { key: 'perQuestion', label: 'Per question' },
];

function Panel({ request }: { request: NewQuizRequest }) {
  const styles = useThemedStyles(makePanelStyles);
  const q = useThemedStyles(makeQuizStyles);
  const { colors: c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = useLayoutMode() === 'wide';
  const offline = useConnectivity() === 'offline';
  const scroll = useRef<ScrollView>(null);
  const chipsScroll = useRef<ScrollView>(null);

  const [courses, setCourses] = useState<QuizCourse[] | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [material, setMaterial] = useState<QuizMaterial | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wholeCourse, setWholeCourse] = useState(true);
  const [lectureIds, setLectureIds] = useState<string[]>([]);
  const [ticks, setTicks] = useState({ summaries: true, lectureMedia: true });
  const [fileIds, setFileIds] = useState<string[]>([]);
  const [pastExamIds, setPastExamIds] = useState<string[]>([]);
  const [titles, setTitles] = useState<Record<string, { title: string; kind: string }>>({});
  const [library, setLibrary] = useState<Role | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sliders, setSliders] = useState<QuizSliders | null>(null);
  const [touched, setTouched] = useState(false);
  const [choices, setChoices] = useState<QuizChoices>(DEFAULT_CHOICES);
  const [minutesText, setMinutesText] = useState<string | null>(null);
  const [secondsText, setSecondsText] = useState('60');
  const [thresholdText, setThresholdText] = useState('60');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Step 9.1b-2: each past exam's format, read when it is added.
  const [formats, setFormats] = useState<Record<string, { state: 'reading' | 'read' | 'failed'; format?: PastExamFormatRead; note?: string }>>({});

  // The courses, then the one to start on: the one asked for, the newest quiz's, else the first.
  useEffect(() => {
    let live = true;
    Promise.all([quizCourses(), request.courseId ? Promise.resolve(request.courseId) : lastQuizCourse()])
      .then(([list, preferred]) => {
        if (!live) return;
        setCourses(list);
        setCourseId(list.find((x) => x.id === preferred)?.id ?? list[0]?.id ?? null);
      })
      .catch((err) => live && setLoadError(errorMessage(err, 'Could not load your courses.')));
    return () => {
      live = false;
    };
  }, [request.courseId]);

  // A course: its lectures (the whole course chosen), its defaults (unless she moved a slider), nothing added yet.
  useEffect(() => {
    const course = courses?.find((x) => x.id === courseId);
    if (!course) return;
    let live = true;
    setMaterial(null);
    setLoadError(null);
    loadQuizMaterial(course)
      .then((m) => {
        if (!live) return;
        setMaterial(m);
        setWholeCourse(true);
        setLectureIds(m.lectures.filter((l) => l.hasTranscript).map((l) => l.id));
        setFileIds([]);
        setPastExamIds([]);
        setLibrary(null);
        setTitles(Object.fromEntries(m.files.map((f) => [f.id, { title: f.title, kind: f.kind }])));
        setSliders((s) => (touched && s ? s : { ...m.defaults }));
      })
      .catch((err) => live && setLoadError(errorMessage(err, 'Could not load this course.')));
    return () => {
      live = false;
    };
    // `touched` is read when the course changes, not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, courses]);

  const loaded = !!material && !!sliders;
  // The web draws scrollbars from the CSS color-scheme (as the summarize panel).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    for (const view of [scroll.current, chipsScroll.current]) {
      const node = (view as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      if (node) node.style.colorScheme = scheme === 'dark' ? 'dark' : '';
    }
  }, [scheme, loaded, wide]);

  const chosen: MaterialLecture[] = useMemo(() => (material ? chosenLectures(material, { topic: { wholeCourse, lectureIds } }) : []), [material, wholeCourse, lectureIds]);

  // The time limit's and pass mark's fields, as numbers (NaN while being typed).
  const timeLimit = (plan: QuizPlan | null): QuizChoices['timeLimit'] =>
    choices.timeLimit.kind === 'total'
      ? { kind: 'total', minutes: minutesText === null ? suggestedMinutes(plan?.minutes ?? 10) : Number(minutesText) }
      : choices.timeLimit.kind === 'perQuestion'
        ? { kind: 'perQuestion', seconds: Number(secondsText) }
        : { kind: 'none' };

  const settingsWith = (plan: QuizPlan | null): QuizSettings | null =>
    sliders
      ? {
          version: SETTINGS_VERSION,
          sliders,
          choices: { ...choices, timeLimit: timeLimit(plan), grading: choices.grading.kind === 'passFail' ? { kind: 'passFail', threshold: Number(thresholdText) } : { kind: 'score' } },
          topic: { wholeCourse, lectureIds: chosen.map((l) => l.id) },
          resources: { notes: true, summaries: ticks.summaries, lectureMedia: ticks.lectureMedia, fileIds },
          pastExamIds,
        }
      : null;

  // The past exams' formats read so far, as the one the calculator takes.
  const pastExam = useMemo(() => mergeFormats(pastExamIds.flatMap((id) => (formats[id]?.format ? [formats[id].format!] : []))), [pastExamIds, formats]);
  const plan: QuizPlan | null = useMemo(() => {
    const s = settingsWith(null);
    if (!material || !s || !chosen.length || !choices.types.length) return null;
    try {
      return planQuiz(planInputFor(material, s, pastExam));
    } catch {
      return null;
    }
    // settingsWith reads the state below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, sliders, choices, chosen, ticks, fileIds, pastExamIds, pastExam]);

  const settings = settingsWith(plan);
  const problem = !material ? null : !chosen.length ? 'Pick at least one lecture.' : settings ? settingsProblem(settings) : null;
  const readingFormat = pastExamIds.some((id) => formats[id]?.state === 'reading');
  const canCreate = !!plan && !!settings && !problem && !offline && !busy && !uploading && !readingFormat;

  /** A past exam's format, read now (the saved one when there is one); its length becomes Number of questions (Lea's list, 2 Nov). */
  const readFormat = async (id: string) => {
    setFormats((f) => ({ ...f, [id]: { state: 'reading' } }));
    try {
      const format = await pastExamFormat(id);
      setFormats((f) => ({ ...f, [id]: { state: 'read', format } }));
      if (format.questionCount > 0) {
        setTouched(true);
        setSliders((s) => (s ? { ...s, count: countValueFor(format.questionCount) } : s));
      }
    } catch (err) {
      const note = err instanceof ConsentDeclinedError ? 'Not read: Studiply needs your permission' : errorMessage(err, 'Couldn’t read its format');
      setFormats((f) => ({ ...f, [id]: { state: 'failed', note } }));
    }
  };
  const formatLine = (id: string): string => {
    const f = formats[id];
    if (!f || f.state === 'reading') return 'Reading its format…';
    if (f.state === 'failed' || !f.format) return f.note ?? 'Couldn’t read its format';
    const kinds = f.format.types.filter((t) => t.count > 0).sort((a, b) => b.count - a.count).map((t) => QUESTION_TYPE_LABELS[t.type]);
    return [`${f.format.questionCount} questions`, kinds.slice(0, 3).join(', ')].filter(Boolean).join(' · ');
  };

  const close = () => {
    if (!busy) closeNewQuiz();
  };

  const set = (key: QuizSliderKey, value: number) => {
    setSavedNote(null);
    setTouched(true);
    setSliders((s) => (s ? { ...s, [key]: value } : s));
  };
  const preset = (key: (typeof QUIZ_PRESET_ORDER)[number]) => {
    setSavedNote(null);
    setTouched(true);
    setSliders({ ...QUIZ_PRESETS[key].sliders });
  };
  const choose = (patch: Partial<QuizChoices>) => setChoices((x) => ({ ...x, ...patch }));

  // The topic.
  const transcribed = (material?.lectures ?? []).filter((l) => l.hasTranscript);
  const toggleWhole = () => {
    if (wholeCourse) {
      setWholeCourse(false);
      setLectureIds([]);
    } else {
      setWholeCourse(true);
      setLectureIds(transcribed.map((l) => l.id));
    }
  };
  const toggleLectures = (ids: string[]) => {
    setLectureIds((now) => {
      const allOn = ids.every((id) => now.includes(id));
      const next = allOn ? now.filter((id) => !ids.includes(id)) : [...now, ...ids.filter((id) => !now.includes(id))];
      setWholeCourse(transcribed.length > 0 && transcribed.every((l) => next.includes(l.id)));
      return next;
    });
  };

  // Files: from the library, or uploaded into the course.
  const listFor = (role: Role) => (role === 'resource' ? fileIds : pastExamIds);
  const setListFor = (role: Role) => (role === 'resource' ? setFileIds : setPastExamIds);
  const addFile = (role: Role, id: string) => {
    setListFor(role)((list) => (list.includes(id) ? list : [...list, id]));
    if (role === 'pastExam' && formats[id]?.state !== 'read') void readFormat(id);
  };
  const removeFile = (role: Role, id: string) => setListFor(role)((list) => list.filter((x) => x !== id));
  const upload = async (role: Role) => {
    if (!material) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      setUploading(true);
      for (const asset of result.assets) {
        const picked = { uri: asset.uri, name: asset.name ?? null, mimeType: asset.mimeType ?? null, sizeBytes: asset.size ?? null };
        const id = await uploadLibraryFile({ courseId: material.courseId, folderId: null }, picked);
        const kind = uploadKindOf(picked) === 'photo' ? 'image' : 'pdf';
        setTitles((t) => ({ ...t, [id]: { title: libraryTitle(kind === 'image' ? 'photo' : 'pdf', picked.name, new Date()), kind } }));
        addFile(role, id);
      }
    } catch (err) {
      showAlert('The file wasn’t added', errorMessage(err, 'Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const saveDefault = async () => {
    if (!material || !sliders) return;
    try {
      await saveQuizDefaults(material.courseId, sliders);
      setSavedNote(`Saved as ${material.courseName}’s default`);
    } catch (err) {
      showAlert('The defaults weren’t saved', errorMessage(err, 'Please try again.'));
    }
  };
  const saveBlocked = offline ? 'Needs a connection' : null;

  const create = async () => {
    if (!canCreate || !material || !plan || !settings) return;
    setBusy(true);
    let id: string;
    try {
      id = await createQuiz({ courseId: material.courseId, title: quizTitle(material.courseName, chosen, wholeCourse), settings, plan });
    } catch (err) {
      showAlert('The quiz wasn’t saved', errorMessage(err, 'Please try again.'));
      setBusy(false);
      return;
    }
    // Saved: now written (9.1b-2). If it can't start, it stays "Saved · not started" with Start.
    try {
      await startQuiz(id);
    } catch (err) {
      if (!(err instanceof ConsentDeclinedError)) showAlert('Your quiz was saved but not started', errorMessage(err, 'Start it from Quiz me.'));
    }
    closeNewQuiz();
  };

  // -----------------------------------------------------------------
  // Parts
  // -----------------------------------------------------------------

  const label = (text: string) => <Text style={styles.label}>{text}</Text>;

  const pill = (text: string, on: boolean, onPress: () => void, data: Record<string, string>, role: 'radio' | 'checkbox' = 'radio', disabled = false) => (
    <Pressable
      key={data.newquiz + (data.key ?? '')}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [q.pill, on && q.pillOn, disabled && styles.dim, pressed && styles.pressed]}
      accessibilityRole={role}
      {...a11yState({ checked: on, disabled })}
      accessibilityLabel={text}
      {...{ dataSet: { ...data, checked: String(on) } }}
    >
      <Text style={[q.pillText, on && q.pillTextOn]}>{text}</Text>
    </Pressable>
  );

  const courseChips = (courses ?? []).map((x) => pill(x.name, x.id === courseId, () => setCourseId(x.id), { newquiz: 'course', key: x.id }));

  const lectureRow = (l: MaterialLecture) => {
    const on = lectureIds.includes(l.id);
    const off = !l.hasTranscript;
    return (
      <Pressable
        key={l.id}
        onPress={() => toggleLectures([l.id])}
        disabled={off}
        style={[q.lecture, on && q.lectureOn, off && q.lectureOff]}
        accessibilityRole="checkbox"
        {...a11yState({ checked: on, disabled: off })}
        accessibilityLabel={l.title}
        {...{ dataSet: { newquiz: 'lecture', id: l.id, checked: String(on) } }}
      >
        <CheckBox on={on} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {l.title}
          </Text>
          <Text style={styles.cardDetail} numberOfLines={1}>
            {off ? 'No transcript yet' : [l.durationMs ? `${Math.round(l.durationMs / 60000)} min` : null, l.hasSummary ? 'has a summary' : 'no summary yet', l.marks ? `${l.marks} ${l.marks === 1 ? 'mark' : 'marks'}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </Pressable>
    );
  };

  const topic = material && (
    <View style={styles.list}>
      <Pressable
        onPress={toggleWhole}
        disabled={!transcribed.length}
        style={[q.lecture, wholeCourse && q.lectureOn]}
        accessibilityRole="checkbox"
        {...a11yState({ checked: wholeCourse, disabled: !transcribed.length })}
        accessibilityLabel="Whole course"
        {...{ dataSet: { newquiz: 'whole-course', checked: String(wholeCourse) } }}
      >
        <CheckBox on={wholeCourse} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Whole course</Text>
          <Text style={styles.cardDetail}>{transcribed.length ? `${transcribed.length} of ${material.lectures.length} lectures have a transcript` : 'No lecture has a transcript yet'}</Text>
        </View>
      </Pressable>
      {material.lectures.filter((l) => !l.folderId).map(lectureRow)}
      {material.folders.map((f) => {
        const inside = material.lectures.filter((l) => l.folderId === f.id);
        if (!inside.length) return null;
        const usable = inside.filter((l) => l.hasTranscript).map((l) => l.id);
        const allOn = usable.length > 0 && usable.every((id) => lectureIds.includes(id));
        return (
          <View key={f.id} style={styles.list}>
            <Pressable
              onPress={() => toggleLectures(usable)}
              disabled={!usable.length}
              style={q.folder}
              accessibilityRole="checkbox"
              {...a11yState({ checked: allOn, disabled: !usable.length })}
              accessibilityLabel={`Folder ${f.name}`}
              {...{ dataSet: { newquiz: 'folder', id: f.id, checked: String(allOn) } }}
            >
              <CheckBox on={allOn} />
              <Ionicons name="folder-outline" size={16} color={c.text.secondary} />
              <Text style={styles.cardTitle}>{f.name}</Text>
            </Pressable>
            <View style={q.indent}>{inside.map(lectureRow)}</View>
          </View>
        );
      })}
      {!material.lectures.length && <Text style={styles.noteText}>No lectures in this course yet.</Text>}
    </View>
  );

  // Resources: the cards (laptop) or rows (iPhone).
  type Res = { key: string; title: string; detail: string; on: boolean; locked?: boolean; onPress: () => void; data: Record<string, string> };
  const summarized = chosen.filter((l) => l.hasSummary).length;
  const fileRes = (role: Role) =>
    listFor(role).map(
      (id): Res => ({
        key: `${role}-${id}`,
        title: titles[id]?.title ?? 'File',
        detail: role === 'pastExam' ? formatLine(id) : kindLabel(titles[id]?.kind ?? 'pdf'),
        on: true,
        onPress: () => removeFile(role, id),
        data: { newquiz: role === 'resource' ? 'resource-file' : 'past-exam', id },
      }),
    );
  const resources: Res[] = [
    { key: 'notes', title: 'My notes and marks', detail: 'Always included', on: true, locked: true, onPress: () => {}, data: { newquiz: 'resource-notes' } },
    {
      key: 'summaries',
      title: 'Their summaries',
      detail: chosen.length ? `${summarized} of ${chosen.length} ${chosen.length === 1 ? 'lecture has' : 'lectures have'} one` : 'Pick lectures first',
      on: ticks.summaries,
      onPress: () => setTicks((t) => ({ ...t, summaries: !t.summaries })),
      data: { newquiz: 'resource-summaries' },
    },
    {
      key: 'media',
      title: 'Their slides and photos',
      detail: 'The lectures’ own files',
      on: ticks.lectureMedia,
      onPress: () => setTicks((t) => ({ ...t, lectureMedia: !t.lectureMedia })),
      data: { newquiz: 'resource-media' },
    },
    ...fileRes('resource'),
  ];
  const resourceView = (r: Res) =>
    wide ? (
      <ResourceCard key={r.key} title={r.title} detail={r.detail} on={r.on} locked={r.locked} always={r.locked} onPress={r.onPress} hint={r.locked ? 'Always included' : r.on && r.data.id ? 'Removes it' : undefined} data={{ ...r.data, checked: String(r.on) }} />
    ) : (
      <ResourceRow key={r.key} title={r.locked ? r.title : `${r.title}${r.data.id ? ` · ${r.detail}` : ''}`} on={r.on} locked={r.locked} onPress={r.onPress} data={{ ...r.data, checked: String(r.on) }} />
    );

  const libraryBox = (role: Role) => {
    const taken = listFor(role);
    const list = (material?.files ?? []).filter((f) => !taken.includes(f.id));
    return (
      <View style={q.library} {...{ dataSet: { newquiz: 'library', role } }}>
        <View style={q.libraryHead}>
          <Text style={styles.cardTitle}>{role === 'resource' ? 'From my library' : 'A past exam from my library'}</Text>
          <Pressable onPress={() => setLibrary(null)} accessibilityRole="button" style={q.done} {...{ dataSet: { newquiz: 'library-done' } }}>
            <Text style={styles.link}>Done</Text>
          </Pressable>
        </View>
        {list.length ? (
          list.map((f) => (
            <Pressable key={f.id} onPress={() => addFile(role, f.id)} style={q.libraryRow} accessibilityRole="button" accessibilityLabel={`Add ${f.title}`} {...{ dataSet: { newquiz: 'library-file', id: f.id } }}>
              <Ionicons name={f.kind === 'image' ? 'image-outline' : 'document-text-outline'} size={16} color={c.text.secondary} />
              <Text style={[styles.cardTitle, styles.grow]} numberOfLines={1}>
                {f.title}
              </Text>
              <Text style={styles.cardDetail}>{kindLabel(f.kind)}</Text>
              <Ionicons name="add" size={18} color={c.accentDark} />
            </Pressable>
          ))
        ) : (
          <Text style={styles.noteText}>No other files in this course. Upload one instead.</Text>
        )}
      </View>
    );
  };

  const adds = (role: Role) => (
    <View style={styles.adds}>
      <AddButton label={role === 'resource' ? 'From my library' : 'Past exam from my library'} onPress={() => setLibrary(library === role ? null : role)} data={{ newquiz: `add-library-${role}` }} />
      <AddButton label={role === 'resource' ? 'Upload PDF or photos' : 'Upload past exam'} onPress={() => void upload(role)} later={offline} hint="Needs a connection" data={{ newquiz: `add-upload-${role}` }} />
      {uploading && <ActivityIndicator color={c.accent} />}
    </View>
  );

  const pastExams = fileRes('pastExam');

  const sliderRow = (key: QuizSliderKey) => {
    const l = QUIZ_SLIDER_LABELS[key];
    const value = sliders?.[key] ?? 1;
    return (
      <SliderRow
        key={key}
        n={QUIZ_SLIDER_KEYS.indexOf(key) + 1}
        name={l.name}
        low={l.low}
        high={l.high}
        shortLow={l.shortLow}
        shortHigh={l.shortHigh}
        value={value}
        onChange={(v) => set(key, v)}
        wide={wide}
        data={{ newquiz: `slider-${key}`, value: String(value) }}
      />
    );
  };
  const chip = (key: (typeof QUIZ_PRESET_ORDER)[number]) => <PresetChip key={key} label={QUIZ_PRESETS[key].label} onPress={() => preset(key)} data={{ newquiz: `preset-${key}` }} />;

  const toggleType = (t: QuestionType) => choose({ types: choices.types.includes(t) ? choices.types.filter((x) => x !== t) : QUESTION_TYPES.filter((x) => x === t || choices.types.includes(x)) });
  const tick = (text: string, on: boolean, onPress: () => void, key: string) => (
    <Pressable key={key} onPress={onPress} style={q.tick} accessibilityRole="checkbox" {...a11yState({ checked: on })} accessibilityLabel={text} {...{ dataSet: { newquiz: key, checked: String(on) } }}>
      <CheckBox on={on} />
      <Text style={q.choiceText}>{text}</Text>
    </Pressable>
  );
  const numberField = (value: string, onChange: (v: string) => void, unit: string, key: string, accessibilityLabel: string) => (
    <View style={q.numberRow}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        style={q.number}
        accessibilityLabel={accessibilityLabel}
        {...{ dataSet: { newquiz: key } }}
      />
      <Text style={q.choiceText}>{unit}</Text>
    </View>
  );

  const choicesView = (
    <View style={q.choices}>
      <Text style={q.choiceLabel}>Question types</Text>
      <View style={q.pills}>{QUESTION_TYPES.map((t) => pill(TYPE_CHIPS[t], choices.types.includes(t), () => toggleType(t), { newquiz: 'type', key: t }, 'checkbox'))}</View>

      <Text style={q.choiceLabel}>Time limit</Text>
      <View style={q.pills}>
        {LIMIT_KINDS.map((k) =>
          pill(k.label, choices.timeLimit.kind === k.key, () => choose({ timeLimit: k.key === 'total' ? { kind: 'total', minutes: 0 } : k.key === 'perQuestion' ? { kind: 'perQuestion', seconds: 0 } : { kind: 'none' } }), { newquiz: 'limit', key: k.key }),
        )}
        {choices.timeLimit.kind === 'total' && numberField(minutesText ?? String(suggestedMinutes(plan?.minutes ?? 10)), setMinutesText, 'minutes', 'limit-minutes', 'Minutes for the whole quiz')}
        {choices.timeLimit.kind === 'perQuestion' && numberField(secondsText, setSecondsText, 'seconds a question', 'limit-seconds', 'Seconds for each question')}
      </View>

      <Text style={q.choiceLabel}>Language</Text>
      <View style={q.pills}>
        {pill('The course’s', choices.language === null, () => choose({ language: null }), { newquiz: 'language', key: 'course' })}
        {QUIZ_LANGUAGES.map(([code, name]) => pill(name, choices.language === code, () => choose({ language: code }), { newquiz: 'language', key: code }))}
      </View>

      <Text style={q.choiceLabel}>Answers shown</Text>
      <View style={q.pills}>
        {pill('After each question', choices.answers === 'afterEach', () => choose({ answers: 'afterEach' }), { newquiz: 'answers', key: 'afterEach' })}
        {pill('At the end', choices.answers === 'atEnd', () => choose({ answers: 'atEnd' }), { newquiz: 'answers', key: 'atEnd' })}
      </View>

      <Text style={q.choiceLabel}>Grading</Text>
      <View style={q.pills}>
        {pill('Score out of 10', choices.grading.kind === 'score', () => choose({ grading: { kind: 'score' } }), { newquiz: 'grading', key: 'score' })}
        {pill('Pass / fail', choices.grading.kind === 'passFail', () => choose({ grading: { kind: 'passFail', threshold: 60 } }), { newquiz: 'grading', key: 'passFail' })}
        {choices.grading.kind === 'passFail' && numberField(thresholdText, setThresholdText, '% to pass', 'pass-mark', 'Percent needed to pass')}
      </View>

      {tick('Explanations with a link to the moment in the recording', choices.explanations, () => choose({ explanations: !choices.explanations }), 'explanations')}
      {tick('Hints', choices.hints, () => choose({ hints: !choices.hints }), 'hints')}
      {tick('Questions I get wrong come back in the next quiz (and go into review)', choices.wrongComeBack, () => choose({ wrongComeBack: !choices.wrongComeBack }), 'wrong-come-back')}
    </View>
  );

  const note = (
    <View style={styles.note}>
      <Text style={styles.noteText}>
        Questions come only from what you chose here. <Text style={styles.bold}>Writing the quiz comes in a later update</Text>: it’s saved now and waits in Your quizzes.
      </Text>
    </View>
  );

  const preview = plan && (
    <View style={q.previewBox}>
      <Text style={styles.preview} {...{ dataSet: { newquiz: 'preview' } }}>
        {plan.preview}
      </Text>
      {plan.notice && (
        <Text style={[styles.preview, q.notice]} {...{ dataSet: { newquiz: 'notice' } }}>
          {plan.notice}
        </Text>
      )}
    </View>
  );
  const why = !plan && material && (problem ?? (choices.types.length ? null : 'Pick at least one question type.'));

  const saveLink = (
    <View style={wide ? styles.saveWide : styles.saveNarrow}>
      <Pressable onPress={() => void saveDefault()} disabled={!!saveBlocked || !material} accessibilityRole="button" accessibilityState={{ disabled: !!saveBlocked }} accessibilityHint={saveBlocked ?? undefined} {...{ dataSet: { newquiz: 'save-default' } }}>
        <Text style={[styles.link, !!saveBlocked && styles.muted]}>Save as course default</Text>
      </Pressable>
      {(savedNote || saveBlocked) && (
        <Text style={styles.small} {...{ dataSet: { newquiz: 'save-note' } }}>
          {savedNote ?? saveBlocked}
        </Text>
      )}
    </View>
  );

  const buttons = (
    <View style={[styles.buttons, !wide && styles.buttonsNarrow]}>
      <Pressable onPress={close} style={({ pressed }) => [styles.secondary, !wide && styles.grow, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { newquiz: 'cancel' } }}>
        <Text style={styles.secondaryText}>Cancel</Text>
      </Pressable>
      <Pressable
        onPress={() => void create()}
        disabled={!canCreate}
        style={({ pressed }) => [styles.primary, !wide && styles.grow, !canCreate && styles.dim, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canCreate }}
        {...{ dataSet: { newquiz: 'create' } }}
      >
        {busy ? <ActivityIndicator color={c.button.primaryText} /> : <Text style={styles.primaryText}>Create quiz</Text>}
      </Pressable>
    </View>
  );

  const body =
    !courses || (courseId && !loaded) ? (
      <View style={styles.loading}>{loadError ? <Text style={styles.error}>{loadError}</Text> : <ActivityIndicator color={c.accent} />}</View>
    ) : !courses.length ? (
      <View style={styles.loading}>
        <Text style={styles.noteText}>Make a course and record a lecture first: a quiz is made from your lectures.</Text>
      </View>
    ) : (
      <>
        {offline && (
          <View style={q.offline} {...{ dataSet: { newquiz: 'offline' } }}>
            <Text style={q.offlineText}>Making a quiz needs a connection.</Text>
          </View>
        )}
        {label('WHAT IT COVERS')}
        {wide ? (
          <View style={q.pills}>{courseChips}</View>
        ) : (
          <ScrollView horizontal style={styles.chipsScroll} contentContainerStyle={styles.chips}>
            {courseChips}
          </ScrollView>
        )}
        {topic}

        {label('RESOURCES')}
        {wide ? <View style={styles.grid}>{resources.map(resourceView)}</View> : <View style={styles.list}>{resources.map(resourceView)}</View>}
        {adds('resource')}
        {library === 'resource' && libraryBox('resource')}

        {label('EXAMPLE QUIZZES OR PAST EXAMS')}
        {pastExams.length > 0 && (wide ? <View style={styles.grid}>{pastExams.map(resourceView)}</View> : <View style={styles.list}>{pastExams.map(resourceView)}</View>)}
        {pastExamIds
          .filter((id) => formats[id]?.state === 'failed')
          .map((id) => (
            <Pressable
              key={`retry-${id}`}
              onPress={() => void readFormat(id)}
              disabled={offline}
              accessibilityRole="button"
              accessibilityLabel={`Read the format of ${titles[id]?.title ?? 'the exam'} again`}
              {...{ dataSet: { newquiz: 'format-retry', id } }}
            >
              <Text style={[styles.small, q.link]}>Try again: read “{titles[id]?.title ?? 'the exam'}”</Text>
            </Pressable>
          ))}
        <Text style={styles.small}>The quiz copies their format: the same question types, length and style of wording.</Text>
        {adds('pastExam')}
        {library === 'pastExam' && libraryBox('pastExam')}

        {wide ? (
          <>
            <View style={styles.tuneRow}>
              <Text style={[styles.label, styles.tuneLabel]}>TUNE YOUR QUIZ · 10 SLIDERS</Text>
              {QUIZ_PRESET_ORDER.map(chip)}
            </View>
            {[0, 2, 4, 6, 8].map((i) => (
              <View key={i} style={styles.pair}>
                {sliderRow(QUIZ_SLIDER_KEYS[i])}
                {sliderRow(QUIZ_SLIDER_KEYS[i + 1])}
              </View>
            ))}
          </>
        ) : (
          <>
            <ScrollView horizontal ref={chipsScroll} style={styles.chipsScroll} contentContainerStyle={styles.chips} {...{ dataSet: { newquiz: 'chips' } }}>
              {QUIZ_PRESET_ORDER.map(chip)}
            </ScrollView>
            {label('TUNE YOUR QUIZ · 10 SLIDERS')}
            {QUIZ_SLIDER_KEYS.map(sliderRow)}
          </>
        )}

        {label('CHOICES')}
        {choicesView}
        {note}
        {!wide && saveLink}
      </>
    );

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={[styles.backdrop, !wide && styles.backdropNarrow]}>
        {wide && <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Cancel" />}
        <View
          style={wide ? [styles.panel, { width: Math.min(860, width - 48) }] : [styles.sheet, { marginTop: insets.top + 12 }]}
          accessibilityViewIsModal
          accessibilityLabel="New quiz"
          {...{ dataSet: { newquiz: 'panel', layout: wide ? 'card' : 'sheet' } }}
        >
          {!wide && <View style={styles.grabber} />}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              New quiz
            </Text>
            {material && (
              <Text style={styles.counts} numberOfLines={2} {...{ dataSet: { newquiz: 'counts' } }}>
                {countsLine(material, chosen)}
              </Text>
            )}
          </View>
          <ScrollView ref={scroll} style={wide ? styles.scroll : styles.scrollSheet} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
          {wide ? (
            <View style={styles.footer}>
              {saveLink}
              <View style={styles.flex}>
                {preview}
                {why && (
                  <Text style={styles.preview} {...{ dataSet: { newquiz: 'why' } }}>
                    {why}
                  </Text>
                )}
              </View>
              {buttons}
            </View>
          ) : (
            <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
              {preview}
              {why && <Text style={styles.preview}>{why}</Text>}
              {buttons}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeQuizStyles = (c: ThemeColors) =>
  StyleSheet.create({
    pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    // Choices: the presets' pill shape; off is outlined, on is the accent.
    pill: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' },
    pillOn: { borderColor: c.accent, backgroundColor: c.accentLight },
    pillText: { fontSize: Typography.size.sm, color: c.text.primary },
    pillTextOn: { fontWeight: Typography.weight.semibold, color: c.accentDark },
    // The topic: LecturePicker's rows (7.9).
    lecture: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, backgroundColor: c.offWhite },
    lectureOn: { backgroundColor: c.accentLight },
    lectureOff: { opacity: 0.5 },
    folder: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14 },
    indent: { paddingLeft: 24, gap: 8 },
    library: { gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
    libraryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    libraryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 8, borderRadius: 8, backgroundColor: c.offWhite },
    done: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
    choices: { gap: 8 },
    choiceLabel: { marginTop: 4, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    choiceText: { flexShrink: 1, fontSize: Typography.size.sm, color: c.text.primary },
    tick: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
    numberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    number: { width: 64, height: 32, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, color: c.text.primary, backgroundColor: c.card, fontSize: Typography.size.sm, textAlign: 'center' },
    previewBox: { alignItems: 'center', gap: 2 },
    notice: { color: c.status.warning.text },
    offline: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: c.status.warning.bg },
    offlineText: { fontSize: Typography.size.sm, color: c.status.warning.text },
    // A past exam's format that couldn't be read: read it again.
    link: { color: c.accentDark, fontWeight: Typography.weight.semibold, textDecorationLine: 'underline' },
  });
