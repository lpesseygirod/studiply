import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { GradientFill } from '../../../src/components/GradientBackground';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getSession, updateSession } from '../../../src/services/session.service';
import { bulkApplyRetention, getActiveSourceFiles } from '../../../src/services/source-file.service';
import { createNote } from '../../../src/services/note.service';
import type { ClarificationEntry } from '../../../src/services/note.service';
import { transcribeAudio, generateNotes, clarifyContent } from '../../../src/services/ai.service';
import type { NoteResult, TranscriptionResult } from '../../../src/services/ai.service';
import HighlightableText, { splitIntoSentences } from '../../../src/components/HighlightableText';
import type { Session, SourceFile } from '../../../src/types/database';
import { useAuth } from '../../../src/hooks/useAuth';
import { useLectureShell } from '../../../src/hooks/useLectureShell';
import { showAlert } from '../../../src/components/dialogs/dialogs';
import FlowCloseButton, { leaveRecordingFlow } from '../../../src/components/FlowCloseButton';
import { confirmAction } from '../../../src/utils/confirm';

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

type ReviewState = 'processing' | 'error' | 'review';
type NoteAction = 'confirm' | 'redo' | 'delete';
type RetentionPolicy = 'delete_now' | 'delete_3_days' | 'delete_manually' | 'keep_permanently';
type ProcessingStage = 'transcribing' | 'generating';

const SUMMARY_LABELS: Record<string, string> = {
  minimal: 'MINIMAL',
  standard: 'STANDARD',
  extra: 'DETAILED',
};

const RETENTION_OPTIONS: { value: RetentionPolicy; label: string; sub: string }[] = [
  { value: 'delete_now', label: 'Delete now', sub: 'Remove source files immediately' },
  { value: 'delete_3_days', label: 'Delete in 3 days', sub: 'Keep temporarily, then auto-delete' },
  { value: 'delete_manually', label: 'Delete manually', sub: "I'll delete them when I'm ready" },
  { value: 'keep_permanently', label: 'Keep forever', sub: 'Store source files indefinitely' },
];

function recordingModeOf(value: string | undefined): Session['recording_mode'] | undefined {
  return value === 'lecture' || value === 'standard' || value === 'discussion' ? value : undefined;
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function ReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessionId, summaryLevel, mode } = useLocalSearchParams<{
    sessionId: string;
    summaryLevel: string;
    /** How it was recorded (passed along from the recording screen; not stored). */
    mode?: string;
  }>();
  useLectureShell(sessionId);
  // `session` below is the lecture session; this one is the signed-in profile.
  const { session: authSession } = useAuth();

  // State
  const [screenState, setScreenState] = useState<ReviewState>('processing');
  const [stage, setStage] = useState<ProcessingStage>('transcribing');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorStage, setErrorStage] = useState<ProcessingStage | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [noteResult, setNoteResult] = useState<NoteResult | null>(null);
  const [noteAction, setNoteAction] = useState<NoteAction>('confirm');
  const [retention, setRetention] = useState<RetentionPolicy>('delete_manually');
  const [confirming, setConfirming] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  // Clarification state (review screen — before the note is saved)
  const [highlightedSentences, setHighlightedSentences] = useState<number[]>([]);
  const [reviewClarifications, setReviewClarifications] = useState<ClarificationEntry[]>([]);
  const [isClarifying, setIsClarifying] = useState(false);
  const instructionOpacity = useRef(new Animated.Value(1)).current;

  // "Part 2 of 3" while a long recording is transcribed chunk by chunk
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);

  // Saved transcript ref — if transcription succeeds but note generation fails,
  // we persist it so a retry only needs to re-run generateNotes.
  const savedTranscriptRef = useRef<TranscriptionResult | null>(null);

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  // -------------------------------------------------------------------
  // Prevent hardware back during processing / confirm
  // -------------------------------------------------------------------
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screenState === 'processing' || confirming) return true;
      return false;
    });
    return () => sub.remove();
  }, [screenState, confirming]);

  // -------------------------------------------------------------------
  // Animate progress bar
  // -------------------------------------------------------------------
  useEffect(() => {
    if (screenState !== 'processing') return;
    const target = stage === 'transcribing' ? 0.45 : 0.9;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [stage, screenState, progressAnim]);

  // -------------------------------------------------------------------
  // Run AI pipeline on mount
  // Two-phase: transcription then notes — transcript is saved to Supabase
  // between the two phases so a notes failure never loses the transcript.
  // -------------------------------------------------------------------
  const runProcessing = useCallback(async () => {
    if (!sessionId) return;

    setScreenState('processing');
    setStage('transcribing');
    setErrorStage(null);
    progressAnim.setValue(0);

    // Track the failing phase so the Retry button can label itself correctly.
    let currentPhase: ProcessingStage = 'transcribing';

    try {
      const [s, files] = await Promise.all([
        getSession(sessionId),
        getActiveSourceFiles(sessionId),
      ]);
      setSession(s);
      setSourceFiles(files);

      // ── Phase 1: Transcription ────────────────────────────────
      // Skip if a previous attempt already produced a transcript. The
      // server stores it, so a notes failure never loses it.
      let currentTranscription = savedTranscriptRef.current;
      if (!currentTranscription) {
        currentTranscription = await transcribeAudio({
          lectureId: sessionId,
          onProgress: (done, total) => setChunkProgress(total > 1 ? { done, total } : null),
        });
        savedTranscriptRef.current = currentTranscription;
      }
      setTranscription(currentTranscription);

      // ── Phase 2: Generate notes (photos and PDFs are read by the server) ─
      currentPhase = 'generating';
      setStage('generating');

      const note = await generateNotes({
        lectureId: sessionId,
        summaryLevel: (summaryLevel as 'minimal' | 'standard' | 'extra') ?? 'standard',
        title: s.title,
        recordingMode: recordingModeOf(mode) ?? s.recording_mode,
        includeMedia: files.some(f => f.file_type === 'photo' || f.file_type === 'pdf'),
      });
      setNoteResult(note);

      // Animate bar to 100 %
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start(() => setScreenState('review'));
    } catch (err: unknown) {
      // Messages from the functions (daily limit, consent, network…) are written for the student.
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setErrorStage(currentPhase);
      setErrorMessage(msg);
      setScreenState('error');
    } finally {
      setChunkProgress(null);
    }
  }, [sessionId, summaryLevel, mode, progressAnim]);

  useEffect(() => {
    runProcessing();
  }, [runProcessing]);

  // -------------------------------------------------------------------
  // Clarification (review screen — before note is saved)
  // -------------------------------------------------------------------
  const handleToggleHighlight = useCallback((index: number) => {
    setHighlightedSentences(prev => {
      const wasEmpty = prev.length === 0;
      const next = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      if (wasEmpty && next.length > 0) {
        Animated.timing(instructionOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
      return next;
    });
  }, [instructionOpacity]);

  const handleClarify = useCallback(async () => {
    if (!noteResult || !session || highlightedSentences.length === 0 || isClarifying) return;
    setIsClarifying(true);
    try {
      const sentences = splitIntoSentences(noteResult.summary ?? '');
      const parts = [...highlightedSentences]
        .sort((a, b) => a - b)
        .map(i => sentences[i])
        .filter(Boolean) as string[];

      const response = await clarifyContent({
        lectureId: session.id,
        originalSummary: noteResult.summary ?? '',
        highlightedParts: parts,
      });

      setReviewClarifications(prev => [
        ...prev,
        { highlightedParts: parts, response, createdAt: new Date().toISOString() },
      ]);
      setHighlightedSentences([]);
    } catch (err) {
      showAlert('Could not clarify', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsClarifying(false);
    }
  }, [noteResult, session, highlightedSentences, isClarifying]);

  // -------------------------------------------------------------------
  // Confirm / Redo / Delete
  // -------------------------------------------------------------------
  const handleConfirm = useCallback(async () => {
    if (!session || !noteResult || confirming) return;
    setConfirming(true);

    try {
      const userId = authSession?.user.id;
      if (!userId) throw new Error('No profile is signed in on this device.');

      if (noteAction === 'delete') {
        // User doesn't want the note — just mark session completed.
        await bulkApplyRetention(sessionId, retention);
        await updateSession(sessionId, { status: 'completed' });
        leaveRecordingFlow(router);
        return;
      }

      if (noteAction === 'redo') {
        // Clear saved transcript so the full pipeline re-runs from scratch.
        savedTranscriptRef.current = null;
        setNoteResult(null);
        setTranscription(null);
        setConfirming(false);
        runProcessing();
        return;
      }

      // noteAction === 'confirm'
      await createNote({
        userId,
        sessionId,
        title: noteResult.suggestedTitle,
        summaryLevel: (summaryLevel as 'minimal' | 'standard' | 'extra') ?? 'standard',
        recordingMode: recordingModeOf(mode) ?? session.recording_mode,
        summary: noteResult.summary,
        keyConcepts: noteResult.keyConcepts,
        formulas: noteResult.formulas,
        definitions: noteResult.definitions,
        tags: noteResult.tags,
        unclearParts: noteResult.unclearParts,
        isConfirmed: true,
        manualAnnotations: reviewClarifications.length > 0
          ? JSON.stringify({ clarifications: reviewClarifications })
          : null,
      });
      await bulkApplyRetention(sessionId, retention);
      await updateSession(sessionId, { status: 'completed' });

      leaveRecordingFlow(router);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save note.';
      setErrorMessage(msg);
      setConfirming(false);
      setScreenState('error');
    }
  }, [
    session,
    noteResult,
    confirming,
    noteAction,
    retention,
    sessionId,
    summaryLevel,
    transcription,
    reviewClarifications,
    runProcessing,
    router,
  ]);

  // Leaving before Confirm drops the generated notes, never the recording.
  const confirmLeave = async () => {
    const leave = await confirmAction(
      'Leave without notes?',
      'The recording stays in your library. You can generate the notes again later.',
      'Leave',
    );
    if (leave) leaveRecordingFlow(router);
  };

  // -------------------------------------------------------------------
  // Render: processing
  // -------------------------------------------------------------------
  if (screenState === 'processing') {
    return (
      <View style={styles.container}>
        <GradientFill />
        <ThemedStatusBar />
        <View style={[styles.centeredContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <FlowCloseButton onPress={confirmLeave} />
          <Text style={styles.screenSubtitle}>Processing</Text>

          <View style={styles.processingCard}>
            <Text style={styles.stageLabel}>
              {stage === 'transcribing' ? 'Transcribing audio…' : 'Generating notes…'}
              {stage === 'transcribing' && chunkProgress
                ? ` (part ${Math.min(chunkProgress.done + 1, chunkProgress.total)} of ${chunkProgress.total})`
                : ''}
            </Text>
            <Text style={styles.stageDetail}>
              {stage === 'transcribing'
                ? 'ElevenLabs is converting your recording to text.'
                : 'Claude is analysing the transcript and building your study notes.'}
            </Text>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>

            <Text style={styles.progressHint}>
              {stage === 'transcribing' ? 'Step 1 of 2' : 'Step 2 of 2'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Render: error
  // -------------------------------------------------------------------
  if (screenState === 'error') {
    return (
      <View style={styles.container}>
        <GradientFill />
        <ThemedStatusBar />
        <View style={[styles.centeredContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <FlowCloseButton onPress={() => leaveRecordingFlow(router)} />
          <Text style={styles.screenSubtitle}>Error</Text>

          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          </View>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={styles.primaryButton} onPress={runProcessing} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>
              {errorStage === 'generating' ? 'Retry Notes' : 'Retry'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => leaveRecordingFlow(router)}
            activeOpacity={0.7}
          >
            <Text style={styles.ghostButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Render: review
  // -------------------------------------------------------------------
  if (!noteResult || !session) return null;

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <FlowCloseButton onPress={confirmLeave} />
        <Text style={styles.screenSubtitle}>AI Notes</Text>

        {/* Suggested title banner */}
        <View style={styles.titleBanner}>
          <Text style={styles.titleBannerLabel}>SUGGESTED TITLE</Text>
          <Text style={styles.titleBannerValue}>{noteResult.suggestedTitle}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>
              {SUMMARY_LABELS[summaryLevel ?? 'standard'] ?? 'STANDARD'}
            </Text>
          </View>
        </View>

        {/* Summary */}
        {!!noteResult.summary && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Summary</Text>
            {reviewClarifications.length === 0 && (
              <Animated.Text style={[styles.highlightHint, { opacity: instructionOpacity }]}>
                Tap sentences to highlight parts you want clarified
              </Animated.Text>
            )}
            <HighlightableText
              text={noteResult.summary}
              highlightedIndices={highlightedSentences}
              onToggleHighlight={handleToggleHighlight}
              editable={!isClarifying}
            />
          </View>
        )}

        {/* Clarify button */}
        {highlightedSentences.length > 0 && (
          <TouchableOpacity
            style={[styles.clarifyBtn, isClarifying && { opacity: 0.6 }]}
            onPress={handleClarify}
            disabled={isClarifying}
            activeOpacity={0.85}
          >
            {isClarifying ? (
              <ActivityIndicator size="small" color={c.text.primary} />
            ) : (
              <Text style={styles.clarifyBtnIcon}>💡</Text>
            )}
            <Text style={styles.clarifyBtnText}>
              {isClarifying ? 'Clarifying…' : 'Clarify Highlighted Parts'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Clarification cards */}
        {reviewClarifications.map((entry, i) => (
          <View key={i} style={[styles.card, styles.clarificationCard]}>
            <View style={styles.clarificationHeader}>
              <Text style={styles.clarificationIcon}>💡</Text>
              <Text style={styles.cardTitle}>
                Clarification{reviewClarifications.length > 1 ? ` ${i + 1}` : ''}
              </Text>
            </View>
            <Text style={styles.cardBody}>{entry.response}</Text>
          </View>
        ))}

        {reviewClarifications.length > 0 && (
          <TouchableOpacity
            onPress={() => { setReviewClarifications([]); setHighlightedSentences([]); instructionOpacity.setValue(1); }}
            activeOpacity={0.7}
            style={styles.clearClarificationBtn}
          >
            <Text style={styles.clearClarificationText}>Clear Clarification</Text>
          </TouchableOpacity>
        )}

        {/* Key concepts */}
        {noteResult.keyConcepts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Key Concepts</Text>
            {noteResult.keyConcepts.map((kc, i) => (
              <View key={i} style={styles.conceptRow}>
                <Text style={styles.conceptTerm}>{kc.term}</Text>
                <Text style={styles.conceptExplanation}>{kc.explanation}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tags */}
        {noteResult.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {noteResult.tags.map((tag, i) => (
              <View key={i} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Formulas */}
        {noteResult.formulas.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Formulas</Text>
            {noteResult.formulas.map((f, i) => (
              <View key={i} style={styles.formulaRow}>
                <Text style={styles.formulaName}>{f.name}</Text>
                <View style={styles.formulaExpressionBox}>
                  <Text style={styles.formulaExpression}>{f.expression}</Text>
                </View>
                {!!f.description && (
                  <Text style={styles.formulaDescription}>{f.description}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Definitions */}
        {noteResult.definitions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Definitions</Text>
            {noteResult.definitions.map((d, i) => (
              <View key={i} style={styles.conceptRow}>
                <Text style={styles.conceptTerm}>{d.term}</Text>
                <Text style={styles.conceptExplanation}>{d.definition}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Unclear parts */}
        {noteResult.unclearParts.length > 0 && (
          <View style={[styles.card, styles.unclearCard]}>
            <Text style={styles.cardTitle}>Unclear Parts</Text>
            {noteResult.unclearParts.map((u, i) => (
              <View key={i} style={styles.unclearRow}>
                <Text style={styles.unclearExcerpt}>&quot;{u.excerpt}&quot;</Text>
                <Text style={styles.unclearReason}>{u.reason}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Transcript preview */}
        {!!noteResult.transcriptPreview && (
          <View style={styles.card}>
            <TouchableOpacity
              onPress={() => setTranscriptExpanded(v => !v)}
              style={styles.transcriptHeader}
              activeOpacity={0.7}
            >
              <Text style={styles.cardTitle}>Transcript Preview</Text>
              <Text style={styles.expandChevron}>{transcriptExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {transcriptExpanded && (
              <Text style={styles.transcriptText}>{noteResult.transcriptPreview}</Text>
            )}
          </View>
        )}

        {/* ─── Decision area ─── */}
        <View style={styles.decisionSection}>
          {/* Note action */}
          <Text style={styles.decisionTitle}>What would you like to do with these notes?</Text>
          <View style={styles.actionRow}>
            {(['confirm', 'redo', 'delete'] as NoteAction[]).map(action => (
              <TouchableOpacity
                key={action}
                style={[styles.actionPill, noteAction === action && styles.actionPillActive]}
                onPress={() => setNoteAction(action)}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.actionPillText, noteAction === action && styles.actionPillTextActive]}
                >
                  {action === 'confirm' ? 'Confirm' : action === 'redo' ? 'Redo' : 'Delete'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Source file retention */}
          <Text style={[styles.decisionTitle, { marginTop: 24 }]}>Source file retention</Text>
          {RETENTION_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={styles.retentionRow}
              onPress={() => setRetention(opt.value)}
              activeOpacity={0.7}
            >
              <View style={[styles.radioOuter, retention === opt.value && styles.radioOuterActive]}>
                {retention === opt.value && <View style={styles.radioInner} />}
              </View>
              <View style={styles.retentionTextGroup}>
                <Text style={styles.retentionLabel}>{opt.label}</Text>
                <Text style={styles.retentionSub}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.primaryButton, confirming && styles.primaryButtonDisabled]}
          onPress={handleConfirm}
          disabled={confirming}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>
            {confirming
              ? 'Saving…'
              : noteAction === 'confirm'
              ? 'Confirm Notes'
              : noteAction === 'redo'
              ? 'Redo Notes'
              : 'Delete Notes'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },

  // Shared layout
  centeredContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 16,
  },

  screenSubtitle: {
    fontSize: Typography.size['3xl'],
    fontWeight: Typography.weight.extrabold,
    color: c.text.onGradientStrong,
    marginBottom: 20,
  },

  // Processing card
  processingCard: {
    backgroundColor: c.white,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    gap: 12,
  },
  stageLabel: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
  },
  stageDetail: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },
  progressTrack: {
    height: 6,
    backgroundColor: c.surfaceMuted,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: c.salmon,
    borderRadius: 3,
  },
  progressHint: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
    textAlign: 'right',
  },

  // Error card
  errorCard: {
    backgroundColor: c.status.error.bg,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: c.status.error.border,
    gap: 8,
  },
  errorTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.status.error.text,
  },
  errorMessage: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Title banner
  titleBanner: {
    backgroundColor: c.titleCard,
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  titleBannerLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  titleBannerValue: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: c.salmon,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  levelBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
    letterSpacing: Typography.tracking.wide,
  },

  // Generic card
  card: {
    backgroundColor: c.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    gap: 12,
  },
  cardTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: c.text.primary,
  },
  cardBody: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Key concepts / definitions
  conceptRow: {
    gap: 2,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.surfaceMuted,
  },
  conceptTerm: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  conceptExplanation: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Tags
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: c.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: c.text.secondary,
  },

  // Formulas
  formulaRow: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.surfaceMuted,
  },
  formulaName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  formulaExpressionBox: {
    backgroundColor: c.cardMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formulaExpression: {
    fontSize: Typography.size.sm,
    fontFamily: 'Courier',
    color: c.text.primary,
  },
  formulaDescription: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },

  // Unclear parts
  unclearCard: {
    borderColor: c.status.warning.border,
    backgroundColor: c.status.warning.bg,
  },
  unclearRow: {
    gap: 2,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.status.warning.border,
  },
  unclearExcerpt: {
    fontSize: Typography.size.sm,
    fontStyle: 'italic',
    color: c.text.primary,
  },
  unclearReason: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },

  // Transcript preview
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandChevron: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },
  transcriptText: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
    lineHeight: Typography.size.xs * Typography.leading.relaxed,
    fontFamily: 'Courier',
  },

  // Decision section
  decisionSection: {
    backgroundColor: c.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.surfaceMuted,
    gap: 8,
  },
  decisionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionPill: {
    flex: 1,
    borderRadius: 100,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: c.surfaceMuted,
    backgroundColor: c.white,
  },
  actionPillActive: {
    borderColor: c.salmon,
    backgroundColor: c.salmon,
  },
  actionPillText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text.secondary,
  },
  actionPillTextActive: {
    color: c.text.primary,
  },

  // Retention radio
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: c.surfaceMuted,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: c.salmon,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: c.salmon,
  },
  retentionTextGroup: { flex: 1 },
  retentionLabel: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  retentionSub: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
    marginTop: 1,
  },

  // Buttons
  primaryButton: {
    backgroundColor: c.black,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: c.white,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },
  ghostButton: {
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  ghostButtonText: {
    color: c.text.secondary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },

  // Clarification
  highlightHint: {
    fontSize: Typography.size.xs,
    color: c.text.placeholder,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  clarifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.salmon,
    borderRadius: 100,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  clarifyBtnIcon: { fontSize: Typography.size.base },
  clarifyBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text.primary,
  },
  clarificationCard: {
    backgroundColor: c.status.info.bg,
    borderColor: c.status.info.border,
  },
  clarificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clarificationIcon: { fontSize: Typography.size.base },
  clearClarificationBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  clearClarificationText: {
    fontSize: Typography.size.sm,
    color: c.text.secondary,
    fontWeight: Typography.weight.medium,
  },

  // Low-balance warning
  lowBalanceBanner: {
    backgroundColor: c.status.warning.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.status.warning.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lowBalanceBannerText: {
    fontSize: Typography.size.xs,
    color: c.status.warning.text,
    fontWeight: Typography.weight.medium,
    lineHeight: 18,
  },
});
