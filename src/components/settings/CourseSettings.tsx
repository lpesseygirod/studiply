import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

import type { ThemeColors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { Typography } from '../../constants/typography';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { isNetworkError } from '../../lib/cloudRows';
import { useConnectivity } from '../../lib/connectivity';
import { coursePlan, sessionDate, shortDay, type PlanRows } from '../../lib/review/lectures';
import { readPlanRows } from '../../services/lectureReview.service';
import { EXAM_FORMATS, getCourseSettings, saveCourseSettings, type CourseSettings, type CourseSettingsPatch } from '../../services/courseSettings.service';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { a11yState } from '../../utils/a11y';
import { errorMessage } from '../../utils/errors';
import { PRESETS, SLIDER_KEYS, type SliderKey, type Sliders } from '../../../supabase/functions/_shared/summary-plan';
import { showAlert } from '../dialogs/dialogs';
import { PresetChip, SliderRow } from '../panel/PanelParts';
import { PRESET_ORDER, SLIDER_LABELS } from '../summarize/sliderLabels';
import { dayName, MonthCalendar } from './MonthCalendar';
import { LANGUAGES, SettingSwitch } from './PreferenceSettings';
import { SavedMark } from './SavedMark';
import { SettingsPage } from './SettingsPage';
import { makeSettingsStyles } from './styles';

/** The summary's language: each lecture's own, or one for the whole course. */
const SUMMARY_LANGUAGES: { code: string | null; label: string }[] = [{ code: null, label: 'Each lecture’s own language' }, ...LANGUAGES.filter((l) => l.code !== 'auto')];
/** The sliders are saved this long after the last move. */
const SLIDER_SAVE_MS = 600;
const SAVED_MS = 1500;

/**
 * A course's settings (no mockup: Settings' cards and rows, desktop-05 / iphone-07).
 * Opened from "Course settings…" in every course menu. Laptop: beside the library sidebar, a column
 * on the gradient with "‹ Psicobiología", the title and the ✓; iPhone: a Settings page.
 * - EXAM: Exam date (opens a month calendar; Clear exam date) and Exam format (radios).
 * - REVIEW PLAN: what the plan does, the course's newest lectures with their next reviews under the
 *   exam date (as it is saved: the preview follows at once), and the course's study reminders default.
 * - SUMMARIES: the summary language (each lecture's own, or one), and the 10 slider defaults with the
 *   presets (the summarize panel's controls; it starts from these).
 * Each change is saved on its own (a moment's ✓; the sliders shortly after the last move). Online only:
 * offline a line says so and nothing can be changed. No subject type (Lea, 9 Nov).
 */
export function CourseSettingsScreen({ courseId }: { courseId: string }) {
  const styles = useThemedStyles(makeSettingsStyles);
  const own = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const wide = useLayoutMode() === 'wide';
  const offline = useConnectivity() === 'offline';
  const [settings, setSettings] = useState<CourseSettings | null>(null);
  const [rows, setRows] = useState<PlanRows | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<'date' | 'language' | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSliders = useRef<Sliders | null>(null);

  const load = useCallback(() => {
    setError(null);
    getCourseSettings(courseId)
      .then(setSettings)
      .catch((err) => setError(isNetworkError(err) ? null : errorMessage(err, 'Could not load the course’s settings.')));
    readPlanRows()
      .then(setRows)
      .catch(() => setRows(null));
  }, [courseId]);
  useEffect(() => {
    if (!offline) load();
  }, [load, offline]);

  const save = useCallback(
    async (patch: CourseSettingsPatch) => {
      try {
        await saveCourseSettings(courseId, patch);
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), SAVED_MS);
      } catch (err) {
        showAlert('Not saved', errorMessage(err, 'Please try again.'));
        load();
      }
    },
    [courseId, load],
  );
  const change = (patch: CourseSettingsPatch) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    void save(patch);
  };
  // The sliders: shown at once, saved shortly after the last move (and when the screen closes).
  const flushSliders = useCallback(() => {
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    sliderTimer.current = null;
    const sliders = pendingSliders.current;
    pendingSliders.current = null;
    if (sliders) void save({ sliders });
  }, [save]);
  const changeSliders = (sliders: Sliders) => {
    setSettings((s) => (s ? { ...s, sliders } : s));
    pendingSliders.current = sliders;
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    sliderTimer.current = setTimeout(flushSliders, SLIDER_SAVE_MS);
  };
  useEffect(() => flushSliders, [flushSliders]);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const page = (children: React.ReactNode) => (
    <View style={wide ? own.wide : own.fill} {...{ dataSet: { courseSettings: 'page' } }}>
      <SettingsPage
        title="Course settings"
        back={{ label: settings?.courseName ?? 'Course', href: `/project/${courseId}` as Href }}
        right={<SavedMark visible={saved} />}
      >
        {children}
      </SettingsPage>
    </View>
  );

  if (offline) {
    return page(
      <View style={[styles.card, own.padded]} {...{ dataSet: { courseSettings: 'offline' } }}>
        <Text style={own.lead}>Course settings need a connection</Text>
        <Text style={own.note}>Connect to the internet to see or change this course’s exam date, exam format, summary language and summary defaults.</Text>
      </View>,
    );
  }
  if (!settings) {
    return page(
      <View style={own.loading}>{error ? <Text style={own.error}>{error}</Text> : <ActivityIndicator color={c.accentDark} />}</View>,
    );
  }

  const now = new Date();
  const s = settings;
  const plan = rows ? coursePlan(rows, courseId, s.examDate, s.studyReminders, now) : null;
  const language = SUMMARY_LANGUAGES.find((l) => l.code === s.summaryLanguage)?.label ?? s.summaryLanguage ?? SUMMARY_LANGUAGES[0].label;
  const examText = s.examDate ? dayName(s.examDate) : 'Not set';
  const rule = s.examDate
    ? `Each lecture comes up in Review today 1, 3, 7 and 21 days after it, a week before the exam and the day before (${shortDay(s.examDate, now)}); nothing after the exam.`
    : 'Each lecture comes up in Review today 1, 3, 7 and 21 days after it. With an exam date, also a week before the exam and the day before.';

  const slider = (key: SliderKey) => {
    const l = SLIDER_LABELS[key];
    return (
      <SliderRow
        key={key}
        n={SLIDER_KEYS.indexOf(key) + 1}
        name={l.name}
        low={l.low}
        high={l.high}
        shortLow={l.shortLow}
        shortHigh={l.shortHigh}
        value={s.sliders[key]}
        onChange={(v) => changeSliders({ ...s.sliders, [key]: v })}
        wide={wide}
        data={{ courseSettings: `slider-${key}`, value: String(s.sliders[key]) }}
      />
    );
  };

  return page(
    <>
      {/* ── Exam ─────────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>EXAM</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.toggleRow}
          onPress={() => setOpen((o) => (o === 'date' ? null : 'date'))}
          accessibilityRole="button"
          accessibilityLabel={`Exam date, ${examText}`}
          {...a11yState({ expanded: open === 'date' })}
          {...{ dataSet: { courseSettings: 'exam-date', value: s.examDate ?? '' } }}
        >
          <Text style={styles.rowLabel}>Exam date</Text>
          <View style={styles.rowValue}>
            <Text style={styles.rowValueText}>{examText}</Text>
            <Ionicons name={open === 'date' ? 'chevron-up' : 'chevron-down'} size={16} color={c.text.secondary} />
          </View>
        </Pressable>
        {open === 'date' && (
          <View style={own.inset}>
            <MonthCalendar value={s.examDate} onChange={(day) => change({ examDate: day })} now={now} />
            <Pressable
              onPress={() => change({ examDate: null })}
              disabled={!s.examDate}
              style={own.clear}
              accessibilityRole="button"
              {...a11yState({ disabled: !s.examDate })}
              {...{ dataSet: { courseSettings: 'clear-exam' } }}
            >
              <Text style={[own.link, !s.examDate && own.muted]}>Clear exam date</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Exam format</Text>
          <Text style={own.note}>Summaries’ self-test questions follow it.</Text>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Exam format">
          {EXAM_FORMATS.map((f) => {
            const active = s.examFormat === f.value;
            return (
              <Pressable
                key={f.value ?? 'none'}
                style={styles.radioRow}
                onPress={() => change({ examFormat: f.value })}
                accessibilityRole="radio"
                {...a11yState({ checked: active })}
                {...{ dataSet: { courseSettings: `exam-format-${f.value ?? 'none'}`, checked: String(active) } }}
              >
                <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active && <View style={styles.radioInner} />}</View>
                <Text style={styles.rowLabel}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Review plan ──────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>REVIEW PLAN</Text>
      <View style={styles.card} {...{ dataSet: { courseSettings: 'plan' } }}>
        <View style={own.padded}>
          <Text style={own.note} {...{ dataSet: { courseSettings: 'rule' } }}>
            {rule}
          </Text>
          {plan === null ? (
            <Text style={own.note}>The lectures’ dates couldn’t be loaded.</Text>
          ) : plan.length === 0 ? (
            <Text style={own.note}>No lectures in this course yet.</Text>
          ) : (
            plan.map((l) => (
              <View key={l.fileId} style={own.lecture} {...{ dataSet: { courseSettings: 'plan-lecture', id: l.fileId, days: l.on ? l.upcoming.map((x) => x.day).join(',') : 'off' } }}>
                <Text style={own.lectureTitle} numberOfLines={1}>
                  {l.title} · {shortDay(l.day, now)}
                </Text>
                <Text style={own.note}>{!l.on ? 'Study reminders off' : l.upcoming.length ? `Next: ${l.upcoming.map((x) => sessionDate(x, now)).join(' · ')}` : 'No more reviews'}</Text>
              </View>
            ))
          )}
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <View style={own.grow}>
            <Text style={styles.rowLabel}>Study reminders for this course’s lectures</Text>
            <Text style={own.note}>The summarize panel starts with this; a lecture’s own choice wins.</Text>
          </View>
          <SettingSwitch value={s.studyReminders} onValueChange={(v) => change({ studyReminders: v })} accessibilityLabel="Study reminders for this course’s lectures" />
        </View>
      </View>

      {/* ── Summaries ────────────────────────────────────────── */}
      <Text style={styles.sectionHeader}>SUMMARIES</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.toggleRow}
          onPress={() => setOpen((o) => (o === 'language' ? null : 'language'))}
          accessibilityRole="button"
          accessibilityLabel={`Summary language, ${language}`}
          {...a11yState({ expanded: open === 'language' })}
          {...{ dataSet: { courseSettings: 'language', value: s.summaryLanguage ?? '' } }}
        >
          <Text style={styles.rowLabel}>Summary language</Text>
          <View style={styles.rowValue}>
            <Text style={styles.rowValueText}>{language}</Text>
            <Ionicons name={open === 'language' ? 'chevron-up' : 'chevron-down'} size={16} color={c.text.secondary} />
          </View>
        </Pressable>
        {open === 'language' && (
          <View accessibilityRole="radiogroup" accessibilityLabel="Summary language">
            {SUMMARY_LANGUAGES.map((l) => {
              const active = s.summaryLanguage === l.code;
              return (
                <Pressable
                  key={l.code ?? 'own'}
                  style={styles.radioRow}
                  onPress={() => change({ summaryLanguage: l.code })}
                  accessibilityRole="radio"
                  {...a11yState({ checked: active })}
                  {...{ dataSet: { courseSettings: `language-${l.code ?? 'own'}`, checked: String(active) } }}
                >
                  <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active && <View style={styles.radioInner} />}</View>
                  <Text style={styles.rowLabel}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={styles.divider} />
        <View style={own.padded}>
          <Text style={styles.rowLabel}>Summary defaults · 10 sliders</Text>
          <Text style={own.note}>The summarize panel starts with these (its Save as course default writes them too).</Text>
          <View style={own.chips}>
            {PRESET_ORDER.map((key) => (
              <PresetChip key={key} label={PRESETS[key].label} onPress={() => changeSliders({ ...PRESETS[key].sliders })} data={{ courseSettings: `preset-${key}` }} />
            ))}
          </View>
          {wide
            ? [0, 2, 4, 6, 8].map((i) => (
                <View key={i} style={own.pair}>
                  {slider(SLIDER_KEYS[i])}
                  {slider(SLIDER_KEYS[i + 1])}
                </View>
              ))
            : SLIDER_KEYS.map(slider)}
        </View>
      </View>
    </>,
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    // Laptop: a column on the gradient beside the sidebar.
    wide: { flex: 1, width: '100%', maxWidth: Layout.pageMaxWidth, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 24 },
    loading: { minHeight: 200, alignItems: 'center', justifyContent: 'center' },
    error: { fontSize: Typography.size.base, color: c.error, textAlign: 'center' },
    padded: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
    inset: { paddingHorizontal: 12, paddingBottom: 8 },
    lead: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    note: { fontSize: Typography.size.sm, color: c.text.secondary, lineHeight: 19 },
    lecture: { gap: 2, paddingTop: 6 },
    lectureTitle: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    grow: { flex: 1, gap: 2 },
    clear: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    link: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    muted: { color: c.text.placeholder },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
    pair: { flexDirection: 'row', gap: 28 },
  });
