import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getSession, updateSession } from '../../../src/services/session.service';
import { getActiveSourceFiles } from '../../../src/services/source-file.service';
import { bulkApplyRetention } from '../../../src/services/source-file.service';
import { createTranscript } from '../../../src/services/transcript.service';
import { createNote } from '../../../src/services/note.service';
import type { ClarificationEntry } from '../../../src/services/note.service';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudio, generateNotes, clarifyContent } from '../../../src/services/ai.service';
import type { NoteResult, TranscriptionResult } from '../../../src/services/ai.service';
import { isCreditError, getEstimatedBalances } from '../../../src/services/credit-check.service';
import HighlightableText, { splitIntoSentences } from '../../../src/components/HighlightableText';
import type { Session, SourceFile } from '../../../src/types/database';
import { useAuth } from '../../../src/hooks/useAuth';

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

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sessionId, summaryLevel } = useLocalSearchParams<{
    sessionId: string;
    summaryLevel: string;
  }>();
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

  // Low-balance warning banner (non-blocking)
  const [lowBalanceWarning, setLowBalanceWarning] = useState<string | null>(null);

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

      const userId = authSession?.user.id;
      const logContext = userId ? { userId, sessionId } : undefined;

      // ── Balance check (non-blocking) ─────────────────────────
      if (userId) {
        getEstimatedBalances(userId).then(bal => {
          const openaiLow = bal.openai.status !== 'good';
          const anthropicLow = bal.anthropic.status !== 'good';
          if (openaiLow || anthropicLow) {
            const worst = openaiLow ? bal.openai : bal.anthropic;
            const label = openaiLow ? 'OpenAI' : 'Claude';
            setLowBalanceWarning(
              `🐷 ${label} balance is low (~$${worst.remaining.toFixed(2)} left). This operation costs ~$0.10–0.40`,
            );
          }
        }).catch(() => {});
      }

      const audioFiles = files
        .filter(f => f.file_type === 'audio')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (audioFiles.length === 0) throw new Error('No audio file found for this session.');

      // ── Phase 1: Transcription ────────────────────────────────
      // Skip if a previous attempt already produced a transcript.
      let currentTranscription = savedTranscriptRef.current;
      if (!currentTranscription) {
        currentTranscription = await transcribeAudio({
          audioUris: audioFiles.map(f => f.file_path),
          language: s.language,
          logContext,
        });

        // Save transcript immediately — protects it even if note generation fails.
        savedTranscriptRef.current = currentTranscription;
        setTranscription(currentTranscription);

        if (userId) {
          createTranscript({
            userId,
            sessionId,
            language: currentTranscription.language,
            fullText: currentTranscription.text,
            segments: currentTranscription.segments,
            confidenceScore: undefined,
          }).catch(err => console.warn('[review] Failed to save transcript:', err.message));
        }
      } else {
        setTranscription(currentTranscription);
      }

      // ── Phase 2: Load photos + PDFs, then generate notes ─────
      currentPhase = 'generating';
      setStage('generating');

      const mediaFiles = files.filter(f => f.file_type !== 'audio' && !f.is_deleted);
      const photoFiles = mediaFiles.filter(f => f.file_type === 'photo');
      const pdfFiles   = mediaFiles.filter(f => f.file_type === 'pdf');

      const imageContents: any[] = [];
      for (const photo of photoFiles) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(photo.file_path);
          if (fileInfo.exists) {
            const base64 = await FileSystem.readAsStringAsync(photo.file_path, { encoding: 'base64' });
            imageContents.push({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            });
          }
        } catch {
          // Skip unreadable file
        }
      }

      const pdfContents: any[] = [];
      for (const pdf of pdfFiles) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(pdf.file_path);
          if (fileInfo.exists) {
            const base64 = await FileSystem.readAsStringAsync(pdf.file_path, { encoding: 'base64' });
            pdfContents.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            });
          }
        } catch {
          // Skip unreadable file
        }
      }

      const note = await generateNotes({
        transcript: currentTranscription.text,
        summaryLevel: (summaryLevel as 'minimal' | 'standard' | 'extra') ?? 'standard',
        sessionTitle: s.title,
        language: s.language,
        recordingMode: s.recording_mode,
        imageContents,
        pdfContents,
        logContext,
      });
      setNoteResult(note);

      // Animate bar to 100 %
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: false,
      }).start(() => setScreenState('review'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setErrorStage(currentPhase);
      setErrorMessage(msg);
      setScreenState('error');

      if (isCreditError(msg)) {
        if (currentPhase === 'transcribing') {
          Alert.alert(
            '🐷 OpenAI Piggy Bank Empty',
            'Your OpenAI account has run out of credits. Your recording is saved safely — add credits and tap Retry.',
            [
              { text: 'Open OpenAI', onPress: () => Linking.openURL('https://platform.openai.com/settings/organization/billing') },
              { text: 'OK', style: 'cancel' },
            ],
          );
        } else {
          Alert.alert(
            '🐷 Claude Piggy Bank Empty',
            'Your Anthropic account has run out of credits. Your recording and transcript are saved — add credits and tap Retry Notes.',
            [
              { text: 'Open Anthropic', onPress: () => Linking.openURL('https://console.anthropic.com/settings/billing') },
              { text: 'OK', style: 'cancel' },
            ],
          );
        }
      }
    }
  }, [sessionId, summaryLevel, progressAnim]);

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
        originalSummary: noteResult.summary ?? '',
        highlightedParts: parts,
        language: session.language ?? 'en',
      });

      setReviewClarifications(prev => [
        ...prev,
        { highlightedParts: parts, response, createdAt: new Date().toISOString() },
      ]);
      setHighlightedSentences([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'piggy_bank_anthropic') {
        Alert.alert(
          '🐷 Claude Piggy Bank Empty',
          'Add credits at console.anthropic.com and try again.',
          [
            { text: 'Open Anthropic', onPress: () => Linking.openURL('https://console.anthropic.com/settings/billing') },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else {
        Alert.alert('Error', 'Could not get clarification. Please try again.');
      }
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
        router.replace('/');
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
      const savedNote = await createNote({
        userId,
        sessionId,
        title: noteResult.suggestedTitle,
        summaryLevel: (summaryLevel as 'minimal' | 'standard' | 'extra') ?? 'standard',
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

      router.replace('/');
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

  // -------------------------------------------------------------------
  // Render: processing
  // -------------------------------------------------------------------
  if (screenState === 'processing') {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <View style={[styles.centeredContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.appTitle}>STUDIPLY</Text>
          <Text style={styles.screenSubtitle}>Processing</Text>

          <View style={styles.processingCard}>
            <Text style={styles.stageLabel}>
              {stage === 'transcribing' ? 'Transcribing audio…' : 'Generating notes…'}
            </Text>
            <Text style={styles.stageDetail}>
              {stage === 'transcribing'
                ? 'Whisper is converting your recording to text.'
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
        <StatusBar style="dark" />
        <View style={[styles.centeredContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
          <Text style={styles.appTitle}>STUDIPLY</Text>
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
            onPress={() => router.replace('/')}
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
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.appTitle}>STUDIPLY</Text>
        <Text style={styles.screenSubtitle}>AI Notes</Text>

        {/* Low-balance warning banner */}
        {lowBalanceWarning && (
          <View style={styles.lowBalanceBanner}>
            <Text style={styles.lowBalanceBannerText}>{lowBalanceWarning}</Text>
          </View>
        )}

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
              <ActivityIndicator size="small" color={Colors.text.primary} />
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
                <Text style={styles.unclearExcerpt}>"{u.excerpt}"</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },

  // Shared layout
  centeredContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 16,
  },

  appTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.extrabold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.widest,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: 20,
  },

  // Processing card
  processingCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    gap: 12,
  },
  stageLabel: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  stageDetail: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.salmon,
    borderRadius: 3,
  },
  progressHint: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    textAlign: 'right',
  },

  // Error card
  errorCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#FFCCCC',
    gap: 8,
  },
  errorTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: '#CC3333',
  },
  errorMessage: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Title banner
  titleBanner: {
    backgroundColor: Colors.salmonLight ?? '#F5E0D8',
    borderRadius: 16,
    padding: 20,
    gap: 6,
  },
  titleBannerLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    letterSpacing: Typography.tracking.wide,
  },
  titleBannerValue: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  levelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  levelBadgeText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.wide,
  },

  // Generic card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    gap: 12,
  },
  cardTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  cardBody: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Key concepts / definitions
  conceptRow: {
    gap: 2,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
  },
  conceptTerm: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  conceptExplanation: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Tags
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
  },

  // Formulas
  formulaRow: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
  },
  formulaName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  formulaExpressionBox: {
    backgroundColor: '#F5F5F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  formulaExpression: {
    fontSize: Typography.size.sm,
    fontFamily: 'Courier',
    color: Colors.text.primary,
  },
  formulaDescription: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },

  // Unclear parts
  unclearCard: {
    borderColor: '#FFE4B5',
    backgroundColor: '#FFFBF0',
  },
  unclearRow: {
    gap: 2,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#FFE4B5',
  },
  unclearExcerpt: {
    fontSize: Typography.size.sm,
    fontStyle: 'italic',
    color: Colors.text.primary,
  },
  unclearReason: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },

  // Transcript preview
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandChevron: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  transcriptText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: Typography.size.xs * Typography.leading.relaxed,
    fontFamily: 'Courier',
  },

  // Decision section
  decisionSection: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    gap: 8,
  },
  decisionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
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
    borderColor: Colors.surfaceMuted,
    backgroundColor: Colors.white,
  },
  actionPillActive: {
    borderColor: Colors.salmon,
    backgroundColor: Colors.salmon,
  },
  actionPillText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.secondary,
  },
  actionPillTextActive: {
    color: Colors.text.primary,
  },

  // Retention radio
  retentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: Colors.salmon,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.salmon,
  },
  retentionTextGroup: { flex: 1 },
  retentionLabel: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  retentionSub: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginTop: 1,
  },

  // Buttons
  primaryButton: {
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: Colors.white,
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
    color: Colors.text.secondary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },

  // Clarification
  highlightHint: {
    fontSize: Typography.size.xs,
    color: Colors.text.placeholder,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  clarifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  clarifyBtnIcon: { fontSize: 15 },
  clarifyBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  clarificationCard: {
    backgroundColor: '#E8EAF6',
    borderColor: '#C5CAE9',
  },
  clarificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clarificationIcon: { fontSize: 16 },
  clearClarificationBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  clearClarificationText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },

  // Low-balance warning
  lowBalanceBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lowBalanceBannerText: {
    fontSize: Typography.size.xs,
    color: '#B87B14',
    fontWeight: Typography.weight.medium,
    lineHeight: 18,
  },
});
