import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { useLayoutMode } from '../../hooks/useLayoutMode';
import { useConnectivity } from '../../lib/connectivity';
import { isNetworkError } from '../../lib/cloudRows';
import { notifyLibraryUpdated } from '../../lib/cache';
import { errorMessage } from '../../utils/errors';
import { recorder } from '../../services/recorder';
import { recordingFlow } from '../../services/recording.service';
import {
  addLink,
  addSlides,
  loadSummarizeInfo,
  requestSummary,
  saveCourseDefaults,
  type SummarizeInfo,
  type SummarizeResources,
} from '../../services/summarize.service';
import { PRESETS, SLIDER_KEYS, planSummary, type SliderKey, type Sliders, type SummaryPlan } from '../../../supabase/functions/_shared/summary-plan';
import { promptText, showAlert } from '../dialogs/dialogs';
import { LevelSlider } from '../recording/LevelSlider';
import { choosePhotos } from '../recording/photoBoard';
import { recordingMoment } from '../recording/markPanelState';
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
async function stopAndRequest(p: { lectureId: string; recording: boolean; sliders: Sliders; resources: SummarizeResources; plan: SummaryPlan; open: () => void }) {
  if (p.recording) {
    try {
      await recordingFlow.stop();
    } catch (err) {
      showAlert('Could not stop the recording', errorMessage(err, 'Please try again.'));
      return;
    }
  }
  try {
    await requestSummary(p.lectureId, p.sliders, p.resources, p.plan);
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
}

export function SummarizePanel() {
  const request = useSummarizePanel();
  if (!request) return null;
  return <Panel key={`${request.lectureId}:${request.recording}`} request={request} />;
}

function Panel({ request }: { request: SummarizeRequest }) {
  const styles = useThemedStyles(makeStyles);
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

  const [info, setInfo] = useState<SummarizeInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders | null>(null);
  const [ticks, setTicks] = useState({ slides: true, photos: true, assistant: true });
  const [busy, setBusy] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

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
    void stopAndRequest({
      lectureId,
      recording,
      sliders,
      resources: resources(),
      plan,
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

  const check = (on: boolean, locked = false) => (
    <View style={[styles.box, on && styles.boxOn, locked && styles.boxLocked]}>{on && <Ionicons name="checkmark" size={14} color={locked ? c.button.disabledText : c.accentOn} />}</View>
  );

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
    <Pressable
      key={r.key}
      onPress={() => toggle(r.key)}
      disabled={r.key === 'notes' || !r.has}
      style={({ hovered }: { hovered?: boolean }) => [styles.card, hovered && r.has && r.key !== 'notes' && styles.cardHover]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on(r), disabled: r.key === 'notes' || !r.has }}
      accessibilityLabel={r.title}
      accessibilityHint={r.key === 'notes' ? 'Always included' : undefined}
      {...{ dataSet: { summarize: `resource-${r.key}`, checked: String(on(r)) } }}
    >
      {check(on(r), r.key === 'notes')}
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{r.title}</Text>
        <Text style={[styles.cardDetail, r.key === 'notes' && styles.always]} numberOfLines={1}>
          {r.detail}
        </Text>
      </View>
    </Pressable>
  );

  const resourceRow = (r: Row) =>
    r.key === 'notes' ? (
      <View key={r.key} style={[styles.row, styles.rowNotes]} accessibilityRole="checkbox" accessibilityState={{ checked: true, disabled: true }} accessibilityLabel="My notes and marks, always included" {...{ dataSet: { summarize: 'resource-notes', checked: 'true' } }}>
        <Text style={styles.rowTitleBold}>{r.short}</Text>
        <Text style={styles.alwaysStrong}>Always included ✓</Text>
      </View>
    ) : (
      <Pressable
        key={r.key}
        onPress={() => toggle(r.key)}
        disabled={!r.has}
        style={styles.row}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on(r), disabled: !r.has }}
        accessibilityLabel={r.short}
        {...{ dataSet: { summarize: `resource-${r.key}`, checked: String(on(r)) } }}
      >
        <Text style={[styles.rowTitle, !r.has && styles.muted]}>{r.short}</Text>
        {on(r) && <Ionicons name="checkmark" size={18} color={c.accentDark} />}
      </Pressable>
    );

  const addButton = (label: string, onPress: () => void, key: string, disabled = false) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => [styles.add, disabled && styles.addLater, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? 'Comes with the first summaries' : undefined}
      {...{ dataSet: { summarize: `add-${key}`, later: disabled ? 'true' : undefined } }}
    >
      <Text style={[styles.addText, disabled && styles.muted]}>+ {label}</Text>
    </Pressable>
  );
  const adds = (
    <View style={styles.adds}>
      {addButton('Slides or PDF', () => void addPdf(), 'slides', offline)}
      {addButton('Photos', () => void addPhotos(), 'photos')}
      {addButton('From my library', fromLibrary, 'library', true)}
      {addButton('Link', () => void addUrl(), 'link', offline)}
    </View>
  );

  const chip = (key: (typeof PRESET_ORDER)[number]) => (
    <Pressable
      key={key}
      onPress={() => preset(key)}
      // As the mockups draw them: all four alike; a preset just moves the sliders (no chosen state).
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Preset: ${PRESETS[key].label}`}
      {...{ dataSet: { summarize: `preset-${key}` } }}
    >
      <Text style={styles.chipText}>{PRESETS[key].label}</Text>
    </Pressable>
  );

  const slider = (key: SliderKey) => {
    const n = SLIDER_KEYS.indexOf(key) + 1;
    const l = SLIDER_LABELS[key];
    const value = sliders?.[key] ?? 1;
    return (
      <View key={key} style={styles.slider} {...{ dataSet: { summarize: `slider-${key}`, value: String(value) } }}>
        <View style={styles.sliderHead}>
          <Text style={styles.sliderName}>
            {n} · {l.name}
          </Text>
          <Text style={styles.sliderValue}>{value}/10</Text>
        </View>
        <LevelSlider value={value} onChange={(v) => set(key, v)} label={`${l.name}, from ${l.low} to ${l.high}`} thumb={wide ? 18 : 22} />
        <View style={styles.ends}>
          <Text style={styles.end}>{wide ? `1 · ${l.low}` : l.shortLow}</Text>
          <Text style={styles.end}>{wide ? `10 · ${l.high}` : l.shortHigh}</Text>
        </View>
      </View>
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

  const note = (
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
              Summarize this lecture
            </Text>
            {counts && (
              <Text style={styles.counts} {...{ dataSet: { summarize: 'counts' } }}>
                {countsLine(counts, !wide)}
              </Text>
            )}
          </View>
          <ScrollView ref={scroll} style={wide ? styles.scroll : styles.scrollSheet} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
          {wide ? (
            <View style={styles.footer}>
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.overlay },
    backdropNarrow: { justifyContent: 'flex-start', alignItems: 'stretch' },
    panel: { maxHeight: '92%', backgroundColor: c.card, borderRadius: 20, overflow: 'hidden' },
    sheet: { flex: 1, backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
    grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: c.border },
    header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8, gap: 4 },
    title: { fontSize: Typography.size.lg, fontWeight: Typography.weight.bold, color: c.text.primary },
    counts: { fontSize: Typography.size.sm, color: c.text.secondary },
    // The card is as tall as its content (up to 92 %); the sheet's list fills it, the bar stays at the bottom.
    scroll: { flexGrow: 0, flexShrink: 1 },
    scrollSheet: { flex: 1 },
    body: { paddingHorizontal: 24, paddingBottom: 16, gap: 12 },
    loading: { minHeight: 200, justifyContent: 'center', alignItems: 'center' },
    error: { fontSize: Typography.size.sm, color: c.error },
    label: { marginTop: 8, fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 0.8, color: c.text.secondary },
    // The laptop's resources: a 2 × 2 grid of cards.
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    card: { flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: c.offWhite },
    cardHover: { backgroundColor: c.cardMuted },
    cardText: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    cardDetail: { fontSize: Typography.size.xs, color: c.text.secondary },
    always: { color: c.status.success.text },
    box: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    boxOn: { backgroundColor: c.accent, borderColor: c.accent },
    boxLocked: { backgroundColor: c.button.disabled, borderColor: c.button.disabled },
    // The iPhone's resources: full-width rows.
    list: { gap: 8 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.offWhite },
    rowNotes: { backgroundColor: c.status.success.bg },
    rowTitle: { fontSize: Typography.size.base, color: c.text.primary },
    rowTitleBold: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.text.primary },
    alwaysStrong: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.status.success.text },
    muted: { color: c.text.placeholder },
    adds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    add: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: c.salmon, backgroundColor: c.salmonLight, justifyContent: 'center' },
    addLater: { opacity: 0.6 },
    addText: { fontSize: Typography.size.sm, color: c.text.primary },
    tuneRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
    tuneLabel: { marginTop: 0, marginRight: 4 },
    chipsScroll: { flexGrow: 0, flexShrink: 0 },
    chips: { gap: 8, paddingVertical: 2, alignItems: 'center' },
    chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: c.accentLight, justifyContent: 'center' },
    chipText: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, color: c.accentDark },
    pair: { flexDirection: 'row', gap: 28 },
    slider: { flex: 1, minWidth: 0 },
    sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    sliderName: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.text.primary },
    sliderValue: { fontSize: Typography.size.base, fontWeight: Typography.weight.bold, color: c.accentDark },
    ends: { flexDirection: 'row', justifyContent: 'space-between' },
    end: { fontSize: Typography.size.xs, color: c.text.secondary },
    note: { marginTop: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: c.cardMuted },
    noteText: { fontSize: Typography.size.sm, color: c.text.secondary },
    bold: { fontWeight: Typography.weight.bold, color: c.text.primary },
    saveWide: { gap: 2 },
    saveNarrow: { alignItems: 'center', gap: 2, paddingVertical: 4 },
    link: { fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold, color: c.accentDark },
    small: { fontSize: Typography.size.xs, color: c.text.secondary },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingVertical: 16 },
    flex: { flex: 1, alignItems: 'center' },
    preview: { fontSize: Typography.size.xs, color: c.text.secondary, textAlign: 'center' },
    bottom: { gap: 8, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.card },
    buttons: { flexDirection: 'row', gap: 10 },
    buttonsNarrow: { width: '100%' },
    grow: { flex: 1 },
    secondary: { height: 44, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card },
    secondaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.medium, color: c.text.primary },
    primary: { height: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.button.primary },
    primaryText: { fontSize: Typography.size.base, fontWeight: Typography.weight.semibold, color: c.button.primaryText },
    dim: { opacity: 0.6 },
    pressed: { opacity: 0.7 },
  });
