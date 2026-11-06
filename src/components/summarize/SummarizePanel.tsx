import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useConnectivity } from '../../lib/connectivity';
import { isNetworkError } from '../../lib/cloudRows';
import { notifyLibraryUpdated } from '../../lib/cache';
import { syncEnabled } from '../../lib/sync';
import { ConsentDeclinedError, consentGiven } from '../../services/consent.service';
import { errorMessage } from '../../utils/errors';
import { recorder } from '../../services/recorder';
import { recordingFlow } from '../../services/recording.service';
import {
  addLink,
  addSlides,
  loadSummarizeInfo,
  requestSummary,
  saveCourseDefaults,
  startSummary,
  type SummarizeInfo,
  type SummarizeResources,
  type SummaryTarget,
} from '../../services/summarize.service';
import { requestCombine, type CombineAsk, type CombineTarget } from '../../services/summaryCombine.service';
import { PRESETS, SLIDER_KEYS, planSummary, type SliderKey, type Sliders, type SummaryPlan } from '../../../supabase/functions/_shared/summary-plan';
import { promptText, showAlert } from '../dialogs/dialogs';
import { AddButton, PresetChip, ResourceCard, ResourceRow, SliderRow } from '../panel/PanelParts';
import { makePanelStyles } from '../panel/panelStyles';
import { choosePhotos } from '../recording/photoBoard';
import { recordingMoment } from '../recording/markPanelState';
import { DISCARD_LABEL } from '../recording/discardText';
import { useDiscardRecording } from '../recording/useDiscardRecording';
import { PRESET_ORDER, SLIDER_LABELS, countsLine, plural, previewLine, timesText } from './sliderLabels';
import { closeSummarize, useSummarizePanel, type SummarizeRequest } from './summarizePanelState';

/**
 * Stop & summarize (step 7.3; DESIGN.md "Stop & summarize", docs/design
 * desktop-02 and iphone-05): the lecture's counts, the extra resources (My
 * notes and marks always in), the add buttons, the 10 sliders with the
 * presets, Save as course default, and the calculator's preview line.
 *
 * Laptop: a centred card, the sliders in two columns. iPhone (and the web
 * below 1024 px): a full-screen sheet, one column, the presets as chips
 * that scroll, Keep recording · Generate fixed at the bottom.
 *
 * Opened from a recording, the recording goes on until Stop & generate
 * summary: that stops it, saves the request (a pending `summaries` row,
 * summarize.service) and opens the Summary tab. After class the buttons are
 * Cancel · Generate summary. No AI is called here (step 7.4 writes the summary).
 */
/** Stop & generate summary: stops the recording (if any), saves the request, opens the Summary tab. */
async function stopAndRequest(p: { lectureId: string; recording: boolean; sliders: Sliders; resources: SummarizeResources; plan: SummaryPlan; target?: SummaryTarget; open: () => void }) {
  if (p.recording) {
    try {
      await recordingFlow.stop();
    } catch (err) {
      showAlert('Could not stop the recording', errorMessage(err, 'Please try again.'));
      return;
    }
  }
  const media = p.resources.slides || p.resources.photos;
  let summaryId: string | null = null;
  try {
    summaryId = await requestSummary(p.lectureId, p.sliders, p.resources, p.plan, p.target);
    notifyLibraryUpdated();
  } catch (err) {
    showAlert(
      'Your summary settings weren’t saved',
      isNetworkError(err)
        ? `You’re offline.${p.recording ? ' The recording is saved.' : ''} Summarize it from its Summary tab once you’re online.`
        : errorMessage(err, 'Please try again from the Summary tab.'),
    );
  }
  p.open();
  // Step 7.4: the laptop starts it now when the student already allowed it (no dialog over the screen
  // she's on); the iPhone once the request has reached the server (summarize.service). Otherwise the
  // Summary tab's "Summarize now" asks and starts it.
  if (summaryId && !syncEnabled && (await consentGiven('assistant_summary'))) {
    // Photos and slides go along when already allowed too (the server checks it again); never a dialog here.
    await startSummary(p.lectureId, summaryId, { media: media && (await consentGiven('images')) }).catch((err) => {
      if (!(err instanceof ConsentDeclinedError)) showAlert('The summary didn’t start', `${errorMessage(err, 'Please try again.')} You can start it from the Summary tab.`);
    });
    notifyLibraryUpdated();
  }
}

const COMBINE_TITLES = { extend: 'Extend with next lecture', merge: 'Merge lectures', exam_pack: 'Make exam pack' } as const;

/**
 * Step 7.9: the Extend / Merge / Exam pack request (its Unit summary or Exam pack file made now), then
 * opens where it's written; started at once when the student already allowed it (as 7.4).
 */
async function combineAndStart(p: { ask: CombineAsk; open: (fileId: string, tab: string) => void }) {
  try {
    const { summaryId, fileId } = await requestCombine(p.ask);
    notifyLibraryUpdated();
    p.open(fileId, p.ask.mode !== 'exam_pack' && p.ask.target === 'add' ? 'summary' : 'notes');
    if (await consentGiven('assistant_summary')) {
      const media = p.ask.resources.slides || p.ask.resources.photos;
      await startSummary(fileId, summaryId, { media: media && (await consentGiven('images')) }).catch((err) => {
        if (!(err instanceof ConsentDeclinedError)) showAlert('It didn’t start', `${errorMessage(err, 'Please try again.')} You can start it from the document.`);
      });
      notifyLibraryUpdated();
    }
  } catch (err) {
    showAlert('It wasn’t made', isNetworkError(err) ? 'You’re offline. Extend, Merge and Exam packs need the internet.' : errorMessage(err, 'Please try again.'));
  }
}

export function SummarizePanel() {
  const request = useSummarizePanel();
  if (!request) return null;
  return <Panel key={`${request.lectureId}:${request.recording}`} request={request} />;
}

function Panel({ request }: { request: SummarizeRequest }) {
  const styles = useThemedStyles(makePanelStyles);
  const { colors: c, scheme } = useTheme();
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  const chipsScroll = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = useLayoutMode() === 'wide';
  const connection = useConnectivity();
  const offline = connection === 'offline';
  const { lectureId, recording } = request;
  const discardRecording = useDiscardRecording();

  const [info, setInfo] = useState<SummarizeInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders | null>(null);
  const [ticks, setTicks] = useState({ slides: true, photos: true, assistant: true });
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  // Step 7.7: when the lecture has a summary already, where the new one goes (a new tab unless she chooses).
  const [target, setTarget] = useState<SummaryTarget>('new');
  // Step 7.9: Extend's target: a new Unit summary (default) or added to this lecture's summary.
  const combine = request.combine;
  const [extendTarget, setExtendTarget] = useState<CombineTarget>('unit');

  const load = useCallback(async () => {
    try {
      const now = recorder.state();
      const live = recording && now.lectureId === lectureId && now.status !== 'idle';
      const next = await loadSummarizeInfo(lectureId, live ? { durationMs: recorder.elapsedMs() } : {});
      setInfo(next);
      // The course's defaults (else the spec's) fill everything once; later reloads keep her changes.
      setSliders((s) => s ?? next.defaults);
    } catch (err) {
      setLoadError(errorMessage(err, 'Could not load this lecture.'));
    }
  }, [lectureId, recording]);
  useEffect(() => {
    void load();
  }, [load]);
  // The web draws scrollbars from the CSS color-scheme: dark in dark mode, the browser's own in light mode
  // (as the assistant's chips, 6.2). Again once loaded: the chips' row appears then.
  const loaded = !!info && !!sliders;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    for (const view of [scroll.current, chipsScroll.current]) {
      const node = (view as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
      if (node) node.style.colorScheme = scheme === 'dark' ? 'dark' : '';
    }
  }, [scheme, loaded, wide]);

  const plan: SummaryPlan | null = useMemo(() => {
    if (!info || !sliders) return null;
    try {
      return planSummary({
        sliders,
        transcript: { wordCount: info.transcriptWords, durationMs: info.durationMs },
        marks: info.marks,
        assistant: ticks.assistant ? info.questions : [],
        noteLines: info.noteLines,
        examFormat: null,
      });
    } catch {
      return null;
    }
  }, [info, sliders, ticks.assistant]);

  const close = () => {
    if (!busy) closeSummarize();
  };
  const set = (key: SliderKey, value: number) => {
    setSavedNote(null);
    setSliders((s) => (s ? { ...s, [key]: value } : s));
  };
  const preset = (key: (typeof PRESET_ORDER)[number]) => {
    setSavedNote(null);
    setSliders({ ...PRESETS[key].sliders });
  };

  const resources = (): SummarizeResources => ({
    slides: !!info?.slides.length && ticks.slides,
    photos: !!info?.photos.length && ticks.photos,
    assistant: !!info?.questions.length && ticks.assistant,
    notes: true,
  });

  // The panel closes at once; the strip shows "Saving…" while the recording's last audio goes, as before 7.3.
  const generate = () => {
    if (!sliders || !plan || busy) return;
    setBusy(true);
    closeSummarize();
    if (combine) {
      void combineAndStart({
        ask: {
          mode: combine.mode,
          target: combine.mode === 'extend' ? extendTarget : 'unit',
          lectures: combine.lectureIds.map((id, i) => ({ id, number: combine.numbers[i] ?? i + 1 })),
          courseId: combine.courseId,
          folderId: combine.folderId,
          courseName: info?.courseName ?? null,
          sliders,
          resources: resources(),
          plan,
        },
        open: (fileId, tab) => router.navigate({ pathname: '/doc/[id]', params: { id: fileId, tab, at: String(Date.now()) } }),
      });
      return;
    }
    void stopAndRequest({
      lectureId,
      recording,
      sliders,
      resources: resources(),
      plan,
      ...(info?.hasSummary && { target }),
      open: () => router.navigate({ pathname: '/doc/[id]', params: { id: lectureId, tab: 'summary', at: String(Date.now()) } }),
    });
  };

  const saveDefault = async () => {
    if (!info?.courseId || !sliders) return;
    try {
      await saveCourseDefaults(info.courseId, sliders);
      setSavedNote(info.courseName ? `Saved as ${info.courseName}’s default` : 'Saved as the course’s default');
    } catch (err) {
      showAlert('The defaults weren’t saved', errorMessage(err, 'Please try again.'));
    }
  };
  const saveBlocked = !info?.courseId ? 'Put this lecture in a course to save defaults' : offline ? 'Needs a connection' : null;

  // The add buttons.
  const addPhotos = async () => {
    const m = recordingMoment();
    await choosePhotos(m && m.lectureId === lectureId ? m : { lectureId, ms: Math.max(0, Math.round(info?.durationMs ?? 0)) });
    await load();
  };
  const addPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      await addSlides(lectureId, { uri: asset.uri, name: asset.name ?? null, mimeType: asset.mimeType ?? 'application/pdf', sizeBytes: asset.size ?? null });
      await load();
    } catch (err) {
      showAlert('The slides weren’t added', errorMessage(err, 'Please try again.'));
    }
  };
  const addUrl = async () => {
    const url = await promptText('Add a link', { placeholder: 'https://…', confirmLabel: 'Add', keyboard: 'ascii-capable' });
    if (!url) return;
    try {
      await addLink(lectureId, url);
      await load();
    } catch (err) {
      showAlert('The link wasn’t added', errorMessage(err, 'Please try again.'));
    }
  };
  const fromLibrary = () => showAlert('Comes with the first summaries', 'Adding files from your library comes with the next step, when summaries are written.');

  // -----------------------------------------------------------------
  // Parts
  // -----------------------------------------------------------------

  const counts = info && {
    minutes: Math.round(info.durationMs / 60000),
    noteLines: info.noteLines.length,
    marks: info.marks.length,
    questions: info.questions.length,
  };

  type Row = { key: 'slides' | 'photos' | 'notes' | 'assistant'; title: string; detail: string; short: string; has: boolean };
  const rows: Row[] = info
    ? [
        {
          key: 'slides',
          title: 'Professor’s slides',
          detail: info.slides.length
            ? [info.slides.length === 1 ? info.slides[0].name : plural(info.slides.length, 'file'), info.slides.every((s) => s.pages) ? plural(info.slides.reduce((n, s) => n + (s.pages ?? 0), 0), 'slide') : null].filter(Boolean).join(' · ')
            : 'None added yet',
          short: info.slides.length ? `Slides · ${info.slides.every((s) => s.pages) ? plural(info.slides.reduce((n, s) => n + (s.pages ?? 0), 0), 'page') : plural(info.slides.length, 'file')}` : 'Slides · none yet',
          has: info.slides.length > 0,
        },
        {
          key: 'photos',
          title: 'Board photos',
          detail: info.photos.length ? [plural(info.photos.length, 'photo'), timesText(info.photos.flatMap((p) => (p.tMs === null ? [] : [p.tMs])))].filter(Boolean).join(' · ') : 'None taken yet',
          short: `Board photos · ${info.photos.length || 'none yet'}`,
          has: info.photos.length > 0,
        },
        {
          key: 'notes',
          title: 'My notes and marks',
          detail: `Always included · ${plural(info.noteLines.length, 'line')} · ${plural(info.marks.length, 'mark')} with levels`,
          short: 'My notes and marks',
          has: true,
        },
        {
          key: 'assistant',
          title: 'Questions to the assistant',
          detail: info.questions.length ? (info.answers ? `${plural(info.answers, 'answer')}, saved as Q&A` : plural(info.questions.length, 'question')) : 'No questions asked',
          short: `Questions · ${info.questions.length || 'none'}`,
          has: info.questions.length > 0,
        },
      ]
    : [];

  const toggle = (key: Row['key']) => {
    if (key === 'notes') return;
    setTicks((t) => ({ ...t, [key]: !t[key] }));
  };
  const on = (r: Row) => r.key === 'notes' || (r.has && ticks[r.key]);

  const resourceCard = (r: Row) => (
    <ResourceCard
      key={r.key}
      title={r.title}
      detail={r.detail}
      on={on(r)}
      locked={r.key === 'notes'}
      disabled={!r.has}
      always={r.key === 'notes'}
      onPress={() => toggle(r.key)}
      hint={r.key === 'notes' ? 'Always included' : undefined}
      data={{ summarize: `resource-${r.key}`, checked: String(on(r)) }}
    />
  );

  const resourceRow = (r: Row) => (
    <ResourceRow key={r.key} title={r.short} on={on(r)} locked={r.key === 'notes'} disabled={!r.has} onPress={() => toggle(r.key)} data={{ summarize: `resource-${r.key}`, checked: String(on(r)) }} />
  );

  const addButton = (label: string, onPress: () => void, key: string, disabled = false) => (
    <AddButton key={key} label={label} onPress={onPress} later={disabled} hint="Comes with the first summaries" data={{ summarize: `add-${key}`, later: disabled ? 'true' : undefined }} />
  );
  const adds = (
    <View style={styles.adds}>
      {addButton('Slides or PDF', () => void addPdf(), 'slides', offline)}
      {addButton('Photos', () => void addPhotos(), 'photos')}
      {addButton('From my library', fromLibrary, 'library', true)}
      {addButton('Link', () => void addUrl(), 'link', offline)}
    </View>
  );

  const chip = (key: (typeof PRESET_ORDER)[number]) => <PresetChip key={key} label={PRESETS[key].label} onPress={() => preset(key)} data={{ summarize: `preset-${key}` }} />;

  const slider = (key: SliderKey) => {
    const l = SLIDER_LABELS[key];
    const value = sliders?.[key] ?? 1;
    return (
      <SliderRow
        key={key}
        n={SLIDER_KEYS.indexOf(key) + 1}
        name={l.name}
        low={l.low}
        high={l.high}
        shortLow={l.shortLow}
        shortHigh={l.shortHigh}
        value={value}
        onChange={(v) => set(key, v)}
        wide={wide}
        data={{ summarize: `slider-${key}`, value: String(value) }}
      />
    );
  };

  const preview = plan && info && (
    <Text style={styles.preview} {...{ dataSet: { summarize: 'preview' } }}>
      {previewLine(plan, info.transcriptWords)}
    </Text>
  );

  const saveLink = (
    <View style={wide ? styles.saveWide : styles.saveNarrow}>
      <Pressable
        onPress={() => void saveDefault()}
        disabled={!!saveBlocked}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!saveBlocked }}
        accessibilityHint={saveBlocked ?? undefined}
        {...{ dataSet: { summarize: 'save-default' } }}
      >
        <Text style={[styles.link, !!saveBlocked && styles.muted]}>Save as course default</Text>
      </Pressable>
      {(savedNote || saveBlocked) && (
        <Text style={styles.small} {...{ dataSet: { summarize: 'save-note' } }}>
          {savedNote ?? saveBlocked}
        </Text>
      )}
    </View>
  );

  // Cancel recording (Lea, 6 Nov): opened from a recording only; it asks first, and only its Discard stops it.
  const discardButton =
    recording && !combine ? (
      <Pressable
        onPress={() => void discardRecording({ beforeDiscard: closeSummarize })}
        disabled={busy}
        style={({ pressed }) => [styles.discard, !wide && styles.discardNarrow, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Discard this recording"
        {...{ dataSet: { summarize: 'discard' } }}
      >
        <Text style={styles.discardText}>{DISCARD_LABEL}</Text>
      </Pressable>
    ) : null;

  const keepLabel = recording ? 'Keep recording' : 'Cancel';
  const goLabel = !wide ? 'Generate' : recording ? 'Stop & generate summary' : 'Generate summary';
  const buttons = (
    <View style={[styles.buttons, !wide && styles.buttonsNarrow]}>
      <Pressable onPress={close} style={({ pressed }) => [styles.secondary, !wide && styles.grow, pressed && styles.pressed]} accessibilityRole="button" {...{ dataSet: { summarize: 'keep' } }}>
        <Text style={styles.secondaryText}>{keepLabel}</Text>
      </Pressable>
      <Pressable
        onPress={() => void generate()}
        disabled={!plan || busy}
        style={({ pressed }) => [styles.primary, !wide && styles.grow, (!plan || busy) && styles.dim, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop and generate summary' : 'Generate summary'}
        {...{ dataSet: { summarize: 'generate' } }}
      >
        {busy ? <ActivityIndicator color={c.button.primaryText} /> : <Text style={styles.primaryText}>{goLabel}</Text>}
      </Pressable>
    </View>
  );

  // Step 7.7: the lecture has a summary already: a new tab (default), or the Summary tab written again around her edits.
  const targets: { key: SummaryTarget; title: string; detail: string }[] = [
    { key: 'new', title: 'Put it in a new tab', detail: '“New summary”, after Summary and Transcript. The Summary tab stays as it is.' },
    { key: 'summary', title: 'Update the Summary tab', detail: 'Your edits stay: only the parts you haven’t changed are written again.' },
  ];
  // Step 7.9: Extend's two targets (the 7.7 radios' look).
  const extendTargets: { key: CombineTarget; title: string; detail: string }[] = [
    { key: 'unit', title: 'A new Unit summary', detail: 'A new document in the course with both lectures. This lecture’s summary stays as it is.' },
    { key: 'add', title: 'Add to this summary', detail: 'Only what’s new is added; repeats become comments on what’s there. Your text never changes.' },
  ];
  const note = combine?.mode === 'extend' ? (
    <View style={styles.targets} accessibilityRole="radiogroup" accessibilityLabel="Where the next lecture goes" {...{ dataSet: { summarize: 'extend-target' } }}>
      <Text style={styles.label}>WHERE IT GOES</Text>
      {extendTargets.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => setExtendTarget(t.key)}
          style={[styles.target, extendTarget === t.key && styles.targetOn]}
          accessibilityRole="radio"
          accessibilityState={{ checked: extendTarget === t.key }}
          {...{ dataSet: { summarize: `extend-${t.key}`, checked: String(extendTarget === t.key) } }}
        >
          <View style={[styles.radio, extendTarget === t.key && styles.radioOn]}>{extendTarget === t.key && <View style={styles.radioDot} />}</View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{t.title}</Text>
            <Text style={styles.cardDetail}>{t.detail}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : combine ? (
    <View style={styles.note}>
      <Text style={styles.noteText}>
        {combine.mode === 'merge' ? 'A new Unit summary is made in the course. The lectures’ own summaries stay as they are.' : 'A new Exam pack is made in the course from these lectures’ summaries.'}
      </Text>
    </View>
  ) : info?.hasSummary ? (
    <View style={styles.targets} accessibilityRole="radiogroup" accessibilityLabel="Where the new summary goes" {...{ dataSet: { summarize: 'target' } }}>
      <Text style={styles.label}>THIS LECTURE HAS A SUMMARY · WHERE THE NEW ONE GOES</Text>
      {targets.map((t) => (
        <Pressable
          key={t.key}
          onPress={() => setTarget(t.key)}
          style={[styles.target, target === t.key && styles.targetOn]}
          accessibilityRole="radio"
          accessibilityState={{ checked: target === t.key }}
          {...{ dataSet: { summarize: `target-${t.key}`, checked: String(target === t.key) } }}
        >
          <View style={[styles.radio, target === t.key && styles.radioOn]}>{target === t.key && <View style={styles.radioDot} />}</View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{t.title}</Text>
            <Text style={styles.cardDetail}>{t.detail}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  ) : (
    <View style={styles.note}>
      <Text style={styles.noteText}>
        The summary is written into <Text style={styles.bold}>this document</Text> (Summary tab). Your notes stay untouched in the My notes tab.
      </Text>
    </View>
  );

  const body = !info || !sliders ? (
    <View style={styles.loading}>{loadError ? <Text style={styles.error}>{loadError}</Text> : <ActivityIndicator color={c.accent} />}</View>
  ) : wide ? (
    <>
      <Text style={styles.label}>EXTRA RESOURCES</Text>
      <View style={styles.grid}>{rows.map(resourceCard)}</View>
      {adds}
      <View style={styles.tuneRow}>
        <Text style={[styles.label, styles.tuneLabel]}>TUNE YOUR SUMMARY · 10 SLIDERS</Text>
        {PRESET_ORDER.map(chip)}
      </View>
      {[0, 2, 4, 6, 8].map((i) => (
        <View key={i} style={styles.pair}>
          {slider(SLIDER_KEYS[i])}
          {slider(SLIDER_KEYS[i + 1])}
        </View>
      ))}
      {note}
    </>
  ) : (
    <>
      <Text style={styles.label}>EXTRA RESOURCES</Text>
      {/* iphone-05: My notes and marks first (the green row), then Slides, Board photos, Questions. */}
      <View style={styles.list}>{[...rows.filter((r) => r.key === 'notes'), ...rows.filter((r) => r.key !== 'notes')].map(resourceRow)}</View>
      {adds}
      {/* Only as tall as the chips (it stretched, leaving a gap above the heading); its scrollbar shows, as in the mockup. */}
      <ScrollView horizontal ref={chipsScroll} style={styles.chipsScroll} contentContainerStyle={styles.chips} {...{ dataSet: { summarize: 'chips' } }}>
        {PRESET_ORDER.map(chip)}
      </ScrollView>
      <Text style={styles.label}>TUNE YOUR SUMMARY · 10 SLIDERS</Text>
      {SLIDER_KEYS.map(slider)}
      {note}
      {saveLink}
      {discardButton}
    </>
  );

  return (
    <Modal visible transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={[styles.backdrop, !wide && styles.backdropNarrow]}>
        {wide && <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={keepLabel} />}
        <View
          style={wide ? [styles.panel, { width: Math.min(860, width - 48) }] : [styles.sheet, { marginTop: insets.top + 12 }]}
          accessibilityViewIsModal
          accessibilityLabel="Summarize this lecture"
          {...{ dataSet: { summarize: 'panel', layout: wide ? 'card' : 'sheet' } }}
        >
          {!wide && <View style={styles.grabber} />}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {combine ? COMBINE_TITLES[combine.mode] : 'Summarize this lecture'}
            </Text>
            {combine ? (
              <Text style={styles.counts} numberOfLines={2} {...{ dataSet: { summarize: 'counts' } }}>
                {combine.titles.map((t) => `Lecture ${t}`).join(' + ')}
              </Text>
            ) : (
              counts && (
                <Text style={styles.counts} {...{ dataSet: { summarize: 'counts' } }}>
                  {countsLine(counts, !wide)}
                </Text>
              )
            )}
          </View>
          <ScrollView ref={scroll} style={wide ? styles.scroll : styles.scrollSheet} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
          {wide ? (
            <View style={styles.footer}>
              {discardButton}
              {saveLink}
              <View style={styles.flex}>{preview}</View>
              {buttons}
            </View>
          ) : (
            <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
              {preview}
              {buttons}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

