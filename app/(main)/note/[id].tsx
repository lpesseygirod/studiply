import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { getSession } from '../../../src/services/session.service';
import {
  getNoteBySession,
  updateNote,
  addClarification,
  parseClarifications,
  type ClarificationEntry,
} from '../../../src/services/note.service';
import { getTranscriptBySession } from '../../../src/services/transcript.service';
import { getActiveSourceFiles } from '../../../src/services/source-file.service';
import { getProject } from '../../../src/services/project.service';
import { formatFileSize } from '../../../src/utils/file-size';
import { exportNoteToPDF } from '../../../src/services/export.service';
import { trashSession } from '../../../src/services/trash.service';
import { clarifyContent } from '../../../src/services/ai.service';
import HighlightableText, { splitIntoSentences } from '../../../src/components/HighlightableText';
import { useAuth } from '../../../src/hooks/useAuth';
import type { Session, Note, Transcript, SourceFile, Project } from '../../../src/types/database';

// -------------------------------------------------------------------
// Local display types (cast from JSON columns)
// -------------------------------------------------------------------
type KC = { term: string; explanation: string };
type F = { name: string; expression: string; description?: string };
type D = { term: string; definition: string };
type UP = { excerpt: string; reason: string };

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function retentionLabel(file: SourceFile): string {
  if (file.is_deleted) return 'Deleted';
  switch (file.retention_policy) {
    case 'keep_permanently': return 'Kept permanently';
    case 'delete_3_days': return 'Deletion in 3 days';
    case 'delete_now': return 'Scheduled for deletion';
    default: return 'Manual deletion';
  }
}

function fileTypeIcon(type: SourceFile['file_type']): React.ComponentProps<typeof Ionicons>['name'] {
  if (type === 'audio') return 'mic-outline';
  if (type === 'photo') return 'image-outline';
  return 'document-text-outline';
}

const SUMMARY_LABELS: Record<string, string> = {
  minimal: 'Minimal',
  standard: 'Standard',
  extra: 'Detailed',
};

// -------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------

export default function NoteDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // `session` below is the lecture session; this one is the signed-in profile.
  const { session: authSession } = useAuth();

  // --- Core data ---
  const [session, setSession] = useState<Session | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  // --- Edit mode ---
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Draft fields
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftConcepts, setDraftConcepts] = useState<KC[]>([]);
  const [draftFormulas, setDraftFormulas] = useState<F[]>([]);
  const [draftDefinitions, setDraftDefinitions] = useState<D[]>([]);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftUnclearParts, setDraftUnclearParts] = useState<UP[]>([]);
  // "Add" inputs
  const [newConceptTerm, setNewConceptTerm] = useState('');
  const [newFormulaName, setNewFormulaName] = useState('');
  const [newFormulaExpr, setNewFormulaExpr] = useState('');
  const [newDefTerm, setNewDefTerm] = useState('');
  const [newDefBody, setNewDefBody] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newUnclear, setNewUnclear] = useState('');

  // --- Clarification ---
  const [highlightedSentences, setHighlightedSentences] = useState<number[]>([]);
  const [clarifications, setClarifications] = useState<ClarificationEntry[]>([]);
  const [isClarifying, setIsClarifying] = useState(false);
  const instructionOpacity = useRef(new Animated.Value(1)).current;

  // --- Export ---
  const [isExporting, setIsExporting] = useState(false);

  // -------------------------------------------------------------------
  // Load data
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await getSession(id);
        const n = await getNoteBySession(id);
        const [t, files] = await Promise.all([
          getTranscriptBySession(id),
          getActiveSourceFiles(id),
        ]);

        setSession(s);
        setNote(n);
        setTranscript(t);
        setSourceFiles(files);
        if (n?.manual_annotations) {
          setClarifications(parseClarifications(n.manual_annotations));
        }
        if (s.project_id) {
          getProject(s.project_id)
            .then(p => setProject(p))
            .catch(() => {});
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not load note.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // -------------------------------------------------------------------
  // Edit mode helpers
  // -------------------------------------------------------------------
  const enterEditMode = () => {
    if (!note) return;
    setDraftTitle(note.title);
    setDraftSummary(note.summary ?? '');
    setDraftConcepts((note.key_concepts as unknown as KC[]) ?? []);
    setDraftFormulas((note.formulas as unknown as F[]) ?? []);
    setDraftDefinitions((note.definitions as unknown as D[]) ?? []);
    setDraftTags(note.tags ?? []);
    setDraftUnclearParts((note.unclear_parts as unknown as UP[]) ?? []);
    setNewConceptTerm('');
    setNewFormulaName('');
    setNewFormulaExpr('');
    setNewDefTerm('');
    setNewDefBody('');
    setNewTag('');
    setNewUnclear('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!note) return;
    setIsSaving(true);
    try {
      const updated = await updateNote(note.id, {
        title: draftTitle.trim() || note.title,
        summary: draftSummary,
        keyConcepts: draftConcepts,
        formulas: draftFormulas,
        definitions: draftDefinitions,
        tags: draftTags,
        unclearParts: draftUnclearParts,
      });
      setNote(updated);
      setIsEditing(false);
    } catch {
      Alert.alert('Error', 'Could not save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------------
  // Highlighting & clarification
  // -------------------------------------------------------------------
  const handleToggleHighlight = (index: number) => {
    setHighlightedSentences(prev => {
      const wasEmpty = prev.length === 0;
      const next = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      // Fade out the instruction hint on the first highlight
      if (wasEmpty && next.length > 0) {
        Animated.timing(instructionOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
      return next;
    });
  };

  const handleClarify = async () => {
    if (!note || !session || highlightedSentences.length === 0 || isClarifying) return;
    setIsClarifying(true);
    try {
      const sentences = splitIntoSentences(note.summary ?? '');
      const parts = [...highlightedSentences]
        .sort((a, b) => a - b)
        .map(i => sentences[i])
        .filter(Boolean) as string[];

      const userId = authSession?.user.id;

      const response = await clarifyContent({
        originalSummary: note.summary ?? '',
        highlightedParts: parts,
        fullTranscript: transcript?.full_text,
        language: session.language ?? 'en',
        logContext: userId ? { userId, sessionId: session.id } : undefined,
      });

      const updated = await addClarification(note.id, parts, response);
      setClarifications(parseClarifications(updated.manual_annotations));
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
  };

  const handleClearClarifications = async () => {
    if (!note) return;
    try {
      const updated = await updateNote(note.id, { manualAnnotations: null });
      setNote(updated);
      setClarifications([]);
      setHighlightedSentences([]);
      instructionOpacity.setValue(1);
    } catch {
      Alert.alert('Error', 'Could not clear clarification.');
    }
  };

  const handleExportPDF = async () => {
    if (!note || !session) return;
    setIsExporting(true);
    try {
      await exportNoteToPDF({
        note,
        session,
        transcript: transcript ?? null,
        projectName: project?.name,
      });
    } catch (err) {
      Alert.alert(
        'Export Failed',
        err instanceof Error ? err.message : 'Could not export PDF.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  function showNoteActions() {
    if (!note || !session) return;
    const options = ['Export as PDF', 'Edit Note', 'Delete Session', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 2, title: note.title },
        (index) => {
          if (index === 0) handleExportPDF();
          if (index === 1) enterEditMode();
          if (index === 2) confirmDeleteSession();
        }
      );
    } else {
      Alert.alert(note.title, undefined, [
        { text: 'Export as PDF', onPress: handleExportPDF },
        { text: 'Edit Note', onPress: enterEditMode },
        { text: 'Delete Session', style: 'destructive', onPress: confirmDeleteSession },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  function confirmDeleteSession() {
    if (!session) return;
    Alert.alert(
      'Delete Session',
      `"${session.title}" will be moved to Recently Deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await trashSession(session.id);
              router.back();
            } catch {
              Alert.alert('Error', 'Could not delete session.');
            }
          },
        },
      ]
    );
  }

  function showTranscriptActions() {
    if (!transcript) return;
    const options = ['Copy Transcript', 'Export as PDF', 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: 'Transcript' },
        async (index) => {
          if (index === 0) {
            await Clipboard.setStringAsync(transcript.full_text);
            Alert.alert('Copied', 'Transcript copied to clipboard.');
          }
          if (index === 1) handleExportPDF();
        }
      );
    } else {
      Alert.alert('Transcript', undefined, [
        {
          text: 'Copy Transcript',
          onPress: async () => {
            await Clipboard.setStringAsync(transcript.full_text);
            Alert.alert('Copied', 'Transcript copied to clipboard.');
          },
        },
        { text: 'Export as PDF', onPress: handleExportPDF },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  // -------------------------------------------------------------------
  // Shared header
  // -------------------------------------------------------------------
  const renderHeader = () => (
    <View style={[styles.fixedHeader, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={isEditing ? cancelEdit : () => router.back()}
      >
        <Ionicons
          name={isEditing ? 'close' : 'chevron-back'}
          size={24}
          color={Colors.text.primary}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>STUDIPLY</Text>
      <View style={styles.iconBtn}>
        {isEditing && (
          <TouchableOpacity onPress={handleSave} disabled={isSaving}>
            <Ionicons
              name="checkmark"
              size={24}
              color={isSaving ? Colors.text.placeholder : Colors.success}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // -------------------------------------------------------------------
  // Loading / error
  // -------------------------------------------------------------------
  if (loading || error || !session) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        {renderHeader()}
        <View style={styles.center}>
          {error ? (
            <Text style={styles.errorText}>{error || 'Session not found.'}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Not yet processed
  // -------------------------------------------------------------------
  if (!note) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        {renderHeader()}
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={44} color={Colors.text.placeholder} />
          <Text style={styles.unprocessedTitle}>{session.title}</Text>
          <Text style={styles.unprocessedDate}>{formatDate(session.created_at)}</Text>
          <Text style={styles.unprocessedMsg}>This session hasn't been processed yet</Text>
          <TouchableOpacity
            style={styles.processBtn}
            onPress={() =>
              router.push({
                pathname: '/record/post-session',
                params: { sessionId: session.id, title: session.title },
              })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.processBtnText}>Process Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Cast JSON columns for display / edit
  // -------------------------------------------------------------------
  const viewConcepts = (note.key_concepts as unknown as KC[]) ?? [];
  const viewFormulas = (note.formulas as unknown as F[]) ?? [];
  const viewDefinitions = (note.definitions as unknown as D[]) ?? [];
  const viewTags: string[] = note.tags ?? [];
  const viewUnclearParts = (note.unclear_parts as unknown as UP[]) ?? [];

  // Photo index counter for labelling
  let photoIdx = 0;

  // -------------------------------------------------------------------
  // Full note view / edit view
  // -------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {renderHeader()}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Title banner ─────────────────────────────────── */}
          <TouchableOpacity
            onLongPress={showNoteActions}
            activeOpacity={1}
            delayLongPress={400}
          >
          <View style={styles.titleBanner}>
            {isEditing ? (
              <TextInput
                style={styles.titleInput}
                value={draftTitle}
                onChangeText={setDraftTitle}
                placeholder="Note title"
                placeholderTextColor={Colors.text.placeholder}
                autoCapitalize="words"
                returnKeyType="done"
              />
            ) : (
              <Text style={styles.noteTitle}>{note.title}</Text>
            )}
            {project && <Text style={styles.projectName}>{project.name}</Text>}
            <View style={styles.bannerMeta}>
              <Text style={styles.bannerDate}>{formatDate(session.created_at)}</Text>
              {session.duration_seconds != null && (
                <Text style={styles.bannerDuration}>{formatDuration(session.duration_seconds)}</Text>
              )}
            </View>
          </View>
          </TouchableOpacity>

          {/* ── Metadata pills ────────────────────────────────── */}
          <View style={styles.pillsRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {session.recording_mode.charAt(0).toUpperCase() + session.recording_mode.slice(1)}
              </Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{session.language.toUpperCase()}</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {SUMMARY_LABELS[note.summary_level] ?? note.summary_level}
              </Text>
            </View>
          </View>

          {/* ── Summary ───────────────────────────────────────── */}
          {(!!note.summary || isEditing) && (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, isEditing && styles.editSectionTitle]}>
                {isEditing && <Ionicons name="pencil-outline" size={13} color={Colors.salmon} />}
                {'  '}Summary
              </Text>
              {isEditing ? (
                <TextInput
                  style={styles.textArea}
                  value={draftSummary}
                  onChangeText={setDraftSummary}
                  multiline
                  placeholder="Write a summary..."
                  placeholderTextColor={Colors.text.placeholder}
                  textAlignVertical="top"
                />
              ) : (
                <>
                  {clarifications.length === 0 && (
                    <Animated.Text style={[styles.highlightHint, { opacity: instructionOpacity }]}>
                      Tap sentences to highlight parts you want clarified
                    </Animated.Text>
                  )}
                  <HighlightableText
                    text={note.summary ?? ''}
                    highlightedIndices={highlightedSentences}
                    onToggleHighlight={handleToggleHighlight}
                    editable={!isClarifying}
                  />
                </>
              )}
            </View>
          )}

          {/* ── Clarify button (visible when sentences are highlighted) ── */}
          {!isEditing && highlightedSentences.length > 0 && (
            <TouchableOpacity
              style={[styles.clarifyBtn, isClarifying && styles.btnDisabled]}
              onPress={handleClarify}
              disabled={isClarifying}
              activeOpacity={0.85}
            >
              {isClarifying ? (
                <ActivityIndicator size="small" color={Colors.text.primary} />
              ) : (
                <Ionicons name="bulb-outline" size={16} color={Colors.text.primary} />
              )}
              <Text style={styles.clarifyBtnText}>
                {isClarifying ? 'Clarifying…' : 'Clarify Highlighted Parts'}
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Clarification cards ───────────────────────────── */}
          {!isEditing && clarifications.map((entry, i) => (
            <View key={i} style={[styles.card, styles.clarificationCard]}>
              <View style={styles.clarificationHeader}>
                <Text style={styles.clarificationIcon}>💡</Text>
                <Text style={styles.sectionTitle}>
                  Clarification{clarifications.length > 1 ? ` ${i + 1}` : ''}
                </Text>
              </View>
              <Text style={styles.bodyText}>{entry.response}</Text>
            </View>
          ))}

          {/* ── Clarification actions ─────────────────────────── */}
          {!isEditing && clarifications.length > 0 && (
            <View style={styles.clarificationActions}>
              <TouchableOpacity onPress={handleClearClarifications} activeOpacity={0.7}>
                <Text style={styles.clearClarificationText}>Clear Clarification</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setHighlightedSentences([])}
                activeOpacity={0.7}
              >
                <Text style={styles.moreClarificationText}>Clarify More</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Key Concepts ──────────────────────────────────── */}
          {(viewConcepts.length > 0 || isEditing) && (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, isEditing && styles.editSectionTitle]}>
                {isEditing && <Ionicons name="pencil-outline" size={13} color={Colors.salmon} />}
                {'  '}Key Concepts
              </Text>

              {/* Chips */}
              <View style={styles.chipsWrap}>
                {(isEditing ? draftConcepts : viewConcepts).map((kc, i) => (
                  <View key={i} style={styles.conceptChip}>
                    <Text style={styles.conceptChipText}>{kc.term}</Text>
                    {isEditing && (
                      <TouchableOpacity
                        onPress={() =>
                          setDraftConcepts(prev => prev.filter((_, idx) => idx !== i))
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons name="close" size={13} color={Colors.text.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              {/* Expanded explanations (view only) */}
              {!isEditing &&
                viewConcepts.map((kc, i) => (
                  <View key={i} style={styles.conceptDetail}>
                    <Text style={styles.conceptTerm}>{kc.term}</Text>
                    <Text style={styles.conceptExplanation}>{kc.explanation}</Text>
                  </View>
                ))}

              {/* Add concept (edit only) */}
              {isEditing && (
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.addInput, { flex: 1 }]}
                    value={newConceptTerm}
                    onChangeText={setNewConceptTerm}
                    placeholder="Add concept..."
                    placeholderTextColor={Colors.text.placeholder}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      const t = newConceptTerm.trim();
                      if (t) {
                        setDraftConcepts(prev => [...prev, { term: t, explanation: '' }]);
                        setNewConceptTerm('');
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => {
                      const t = newConceptTerm.trim();
                      if (t) {
                        setDraftConcepts(prev => [...prev, { term: t, explanation: '' }]);
                        setNewConceptTerm('');
                      }
                    }}
                  >
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Tags ──────────────────────────────────────────── */}
          {(viewTags.length > 0 || isEditing) && (
            <View style={isEditing ? styles.card : styles.pillsRowWrap}>
              {isEditing && (
                <Text style={[styles.sectionTitle, styles.editSectionTitle]}>
                  <Ionicons name="pencil-outline" size={13} color={Colors.salmon} />
                  {'  '}Tags
                </Text>
              )}
              <View style={styles.pillsRow}>
                {(isEditing ? draftTags : viewTags).map((tag, i) => (
                  <View key={i} style={styles.tagPill}>
                    <Text style={styles.tagText}>{tag}</Text>
                    {isEditing && (
                      <TouchableOpacity
                        onPress={() =>
                          setDraftTags(prev => prev.filter((_, idx) => idx !== i))
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons name="close" size={12} color={Colors.text.secondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
              {isEditing && (
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.addInput, { flex: 1 }]}
                    value={newTag}
                    onChangeText={setNewTag}
                    placeholder="Add tag..."
                    placeholderTextColor={Colors.text.placeholder}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      let t = newTag.trim();
                      if (!t) return;
                      if (!t.startsWith('#')) t = `#${t}`;
                      setDraftTags(prev => [...prev, t]);
                      setNewTag('');
                    }}
                  />
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => {
                      let t = newTag.trim();
                      if (!t) return;
                      if (!t.startsWith('#')) t = `#${t}`;
                      setDraftTags(prev => [...prev, t]);
                      setNewTag('');
                    }}
                  >
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Formulas ──────────────────────────────────────── */}
          {(viewFormulas.length > 0 || isEditing) && (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, isEditing && styles.editSectionTitle]}>
                {isEditing && <Ionicons name="pencil-outline" size={13} color={Colors.salmon} />}
                {'  '}Formulas
              </Text>
              {(isEditing ? draftFormulas : viewFormulas).map((f, i) => (
                <View key={i} style={styles.formulaItem}>
                  <View style={styles.formulaHeader}>
                    <Text style={styles.formulaName}>{f.name}</Text>
                    {isEditing && (
                      <TouchableOpacity
                        onPress={() =>
                          setDraftFormulas(prev => prev.filter((_, idx) => idx !== i))
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                      >
                        <Ionicons name="close-circle-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.formulaBox}>
                    <Text style={styles.formulaExpression}>{f.expression}</Text>
                  </View>
                  {!!f.description && (
                    <Text style={styles.formulaDesc}>{f.description}</Text>
                  )}
                </View>
              ))}
              {isEditing && (
                <View style={styles.addFormulaGroup}>
                  <TextInput
                    style={styles.addInput}
                    value={newFormulaName}
                    onChangeText={setNewFormulaName}
                    placeholder="Formula name..."
                    placeholderTextColor={Colors.text.placeholder}
                  />
                  <TextInput
                    style={styles.addInput}
                    value={newFormulaExpr}
                    onChangeText={setNewFormulaExpr}
                    placeholder="Expression (e.g. E = mc²)"
                    placeholderTextColor={Colors.text.placeholder}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      const n = newFormulaName.trim();
                      const e = newFormulaExpr.trim();
                      if (n && e) {
                        setDraftFormulas(prev => [...prev, { name: n, expression: e }]);
                        setNewFormulaName('');
                        setNewFormulaExpr('');
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.addBtn, { alignSelf: 'flex-end' }]}
                    onPress={() => {
                      const n = newFormulaName.trim();
                      const e = newFormulaExpr.trim();
                      if (n && e) {
                        setDraftFormulas(prev => [...prev, { name: n, expression: e }]);
                        setNewFormulaName('');
                        setNewFormulaExpr('');
                      }
                    }}
                  >
                    <Text style={styles.addBtnText}>Add Formula</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Definitions ───────────────────────────────────── */}
          {(viewDefinitions.length > 0 || isEditing) && (
            <View style={styles.card}>
              <Text style={[styles.sectionTitle, isEditing && styles.editSectionTitle]}>
                {isEditing && <Ionicons name="pencil-outline" size={13} color={Colors.salmon} />}
                {'  '}Definitions
              </Text>
              {(isEditing ? draftDefinitions : viewDefinitions).map((d, i) => (
                <View key={i} style={styles.definitionItem}>
                  {isEditing ? (
                    <>
                      <View style={styles.defEditHeader}>
                        <TextInput
                          style={[styles.addInput, { flex: 1 }]}
                          value={d.term}
                          onChangeText={v =>
                            setDraftDefinitions(prev =>
                              prev.map((item, idx) =>
                                idx === i ? { ...item, term: v } : item,
                              ),
                            )
                          }
                          placeholder="Term"
                          placeholderTextColor={Colors.text.placeholder}
                        />
                        <TouchableOpacity
                          onPress={() =>
                            setDraftDefinitions(prev => prev.filter((_, idx) => idx !== i))
                          }
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                          <Ionicons name="close-circle-outline" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={[styles.addInput, styles.textAreaSmall]}
                        value={d.definition}
                        onChangeText={v =>
                          setDraftDefinitions(prev =>
                            prev.map((item, idx) =>
                              idx === i ? { ...item, definition: v } : item,
                            ),
                          )
                        }
                        multiline
                        placeholder="Definition"
                        placeholderTextColor={Colors.text.placeholder}
                        textAlignVertical="top"
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.definitionTerm}>{d.term}</Text>
                      <Text style={styles.definitionBody}>{d.definition}</Text>
                    </>
                  )}
                </View>
              ))}
              {isEditing && (
                <View style={styles.addFormulaGroup}>
                  <TextInput
                    style={styles.addInput}
                    value={newDefTerm}
                    onChangeText={setNewDefTerm}
                    placeholder="Term..."
                    placeholderTextColor={Colors.text.placeholder}
                  />
                  <TextInput
                    style={[styles.addInput, styles.textAreaSmall]}
                    value={newDefBody}
                    onChangeText={setNewDefBody}
                    placeholder="Definition..."
                    placeholderTextColor={Colors.text.placeholder}
                    multiline
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.addBtn, { alignSelf: 'flex-end' }]}
                    onPress={() => {
                      const t = newDefTerm.trim();
                      const b = newDefBody.trim();
                      if (t && b) {
                        setDraftDefinitions(prev => [...prev, { term: t, definition: b }]);
                        setNewDefTerm('');
                        setNewDefBody('');
                      }
                    }}
                  >
                    <Text style={styles.addBtnText}>Add Definition</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Unclear parts ─────────────────────────────────── */}
          {(viewUnclearParts.length > 0 || isEditing) && (
            <View style={[styles.card, styles.unclearCard]}>
              <Text style={[styles.sectionTitle, { color: '#8B6914' }, isEditing && styles.editSectionTitle]}>
                {isEditing && <Ionicons name="pencil-outline" size={13} color={Colors.salmon} />}
                {'  '}Unclear Parts
              </Text>
              {(isEditing ? draftUnclearParts : viewUnclearParts).map((u, i) => (
                <View key={i} style={styles.unclearItem}>
                  <View style={styles.defEditHeader}>
                    <Text style={[styles.unclearExcerpt, { flex: 1 }]}>"{u.excerpt}"</Text>
                    {isEditing && (
                      <TouchableOpacity
                        onPress={() =>
                          setDraftUnclearParts(prev => prev.filter((_, idx) => idx !== i))
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.unclearReason}>{u.reason}</Text>
                </View>
              ))}
              {isEditing && (
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.addInput, { flex: 1 }]}
                    value={newUnclear}
                    onChangeText={setNewUnclear}
                    placeholder="Add unclear section..."
                    placeholderTextColor={Colors.text.placeholder}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      const t = newUnclear.trim();
                      if (t) {
                        setDraftUnclearParts(prev => [
                          ...prev,
                          { excerpt: t, reason: 'Manually added' },
                        ]);
                        setNewUnclear('');
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => {
                      const t = newUnclear.trim();
                      if (t) {
                        setDraftUnclearParts(prev => [
                          ...prev,
                          { excerpt: t, reason: 'Manually added' },
                        ]);
                        setNewUnclear('');
                      }
                    }}
                  >
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Full Transcript ───────────────────────────────── */}
          {transcript && (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.transcriptToggle}
                onPress={() => setTranscriptExpanded(v => !v)}
                onLongPress={showTranscriptActions}
                activeOpacity={0.7}
                delayLongPress={400}
              >
                <Text style={styles.sectionTitle}>Full Transcript</Text>
                <Text style={styles.toggleLabel}>
                  {transcriptExpanded ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
              {transcriptExpanded && (
                <Text style={styles.transcriptText}>{transcript.full_text}</Text>
              )}
            </View>
          )}

          {/* ── Source Files ─────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Source Files</Text>
            {sourceFiles.length === 0 ? (
              <Text style={styles.sourceFilesEmpty}>Source files have been removed.</Text>
            ) : (
              sourceFiles.map((file, i) => {
                const isPhoto = file.file_type === 'photo';
                const label = isPhoto
                  ? `Photo ${photoIdx++ + 1}`
                  : file.file_type === 'audio'
                  ? 'Recording'
                  : 'PDF Document';
                const retLabel = retentionLabel(file);
                const isDeleted = file.is_deleted;
                return (
                  <View key={file.id} style={styles.sourceFileRow}>
                    <View style={styles.sourceFileIconWrap}>
                      <Ionicons
                        name={fileTypeIcon(file.file_type)}
                        size={18}
                        color={isDeleted ? Colors.text.placeholder : Colors.text.secondary}
                      />
                    </View>
                    <View style={styles.sourceFileInfo}>
                      <Text
                        style={[styles.sourceFileName, isDeleted && styles.sourceFileDeleted]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text style={styles.sourceFileMeta}>
                        {file.file_size_bytes ? formatFileSize(file.file_size_bytes) + ' · ' : ''}
                        {retLabel}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.retentionBadge,
                        isDeleted && styles.retentionBadgeDeleted,
                        file.retention_policy === 'keep_permanently' && styles.retentionBadgeKept,
                      ]}
                    >
                      <Text
                        style={[
                          styles.retentionBadgeText,
                          isDeleted && styles.retentionBadgeTextDeleted,
                          file.retention_policy === 'keep_permanently' && styles.retentionBadgeTextKept,
                        ]}
                      >
                        {isDeleted ? 'Deleted' : file.retention_policy === 'keep_permanently' ? 'Kept' : '~Del'}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {isEditing ? (
            <View style={styles.editActionsRow}>
              <TouchableOpacity
                style={[styles.saveEditBtn, isSaving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark" size={18} color={Colors.white} />
                <Text style={styles.saveEditBtnText}>
                  {isSaving ? 'Saving…' : 'Save Note'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelEditBtn}
                onPress={cancelEdit}
                activeOpacity={0.75}
              >
                <Ionicons name="close" size={18} color={Colors.text.secondary} />
                <Text style={styles.cancelEditBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, isExporting && styles.btnDisabled]}
                onPress={handleExportPDF}
                disabled={isExporting}
                activeOpacity={0.75}
              >
                <Ionicons name="share-outline" size={18} color={Colors.text.secondary} />
                <Text style={styles.actionButtonText}>
                  {isExporting ? 'Exporting…' : 'Export PDF'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={enterEditMode}
                activeOpacity={0.75}
              >
                <Ionicons name="pencil-outline" size={18} color={Colors.text.secondary} />
                <Text style={styles.actionButtonText}>Edit Note</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

    </View>
  );
}

// -------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },

  // Header
  fixedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.extrabold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.widest,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },

  errorText: {
    fontSize: Typography.size.base,
    color: Colors.error,
    textAlign: 'center',
  },

  // Not processed
  unprocessedTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  unprocessedDate: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  unprocessedMsg: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  processBtn: {
    marginTop: 8,
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  processBtnText: {
    color: Colors.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },

  // Title banner
  titleBanner: {
    backgroundColor: Colors.salmonLight,
    borderRadius: 18,
    padding: 20,
    gap: 4,
  },
  noteTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  titleInput: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.salmon,
    paddingBottom: 4,
  },
  projectName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
  },
  bannerMeta: { flexDirection: 'row', gap: 12, marginTop: 6 },
  bannerDate: { fontSize: Typography.size.sm, color: Colors.text.secondary },
  bannerDuration: { fontSize: Typography.size.sm, color: Colors.text.secondary },

  // Metadata pills
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillsRowWrap: { gap: 8 },
  metaPill: {
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  metaPillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.wide,
  },

  // Generic card
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.surfaceMuted,
    gap: 10,
  },
  sectionTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  editSectionTitle: {
    color: Colors.text.secondary,
    fontSize: Typography.size.sm,
  },
  bodyText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Text area
  textArea: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },
  textAreaSmall: {
    minHeight: 60,
  },

  // Key Concepts
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  conceptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  conceptChipText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  conceptDetail: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 8,
    gap: 2,
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
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  formulaItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 8,
    gap: 4,
  },
  formulaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formulaName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  formulaBox: {
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
  formulaDesc: { fontSize: Typography.size.xs, color: Colors.text.secondary },

  // Definitions
  definitionItem: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 8,
    gap: 4,
  },
  defEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  definitionTerm: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  definitionBody: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    lineHeight: Typography.size.sm * Typography.leading.relaxed,
  },

  // Unclear parts
  unclearCard: {
    backgroundColor: '#FFFBF0',
    borderColor: '#FFE4B5',
  },
  unclearItem: {
    borderTopWidth: 1,
    borderTopColor: '#FFE4B5',
    paddingTop: 8,
    gap: 2,
  },
  unclearExcerpt: {
    fontSize: Typography.size.sm,
    fontStyle: 'italic',
    color: Colors.text.primary,
  },
  unclearReason: { fontSize: Typography.size.xs, color: Colors.text.secondary },

  // Transcript
  transcriptToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  transcriptText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: Typography.size.xs * Typography.leading.relaxed,
    fontFamily: 'Courier',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 10,
  },

  // Source files
  sourceFilesEmpty: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },
  sourceFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 10,
  },
  sourceFileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceFileInfo: { flex: 1, gap: 1 },
  sourceFileName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  sourceFileDeleted: { color: Colors.text.placeholder },
  sourceFileMeta: { fontSize: Typography.size.xs, color: Colors.text.secondary },
  retentionBadge: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  retentionBadgeDeleted: { backgroundColor: '#F2F2F2' },
  retentionBadgeKept: { backgroundColor: '#E8F5EE' },
  retentionBadgeText: {
    fontSize: 10,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.secondary,
    letterSpacing: 0.5,
  },
  retentionBadgeTextDeleted: { color: Colors.text.placeholder },
  retentionBadgeTextKept: { color: '#2D8A5A' },

  // Edit mode add inputs
  addRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 10,
  },
  addInput: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
  },
  addFormulaGroup: {
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceMuted,
    paddingTop: 10,
    gap: 8,
  },
  addBtn: {
    backgroundColor: Colors.salmon,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },

  // Action buttons (view mode)
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.surfaceMuted,
    backgroundColor: Colors.white,
  },
  actionButtonText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
    textAlign: 'center',
  },

  // Save / Cancel (edit mode)
  editActionsRow: {
    gap: 10,
    marginTop: 4,
  },
  saveEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.black,
    borderRadius: 100,
    paddingVertical: 16,
  },
  saveEditBtnText: {
    color: Colors.white,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    letterSpacing: Typography.tracking.wide,
  },
  cancelEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 100,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.surfaceMuted,
  },
  cancelEditBtnText: {
    color: Colors.text.secondary,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
  },
  btnDisabled: { opacity: 0.5 },

  // Highlighting / clarification
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
  clarificationIcon: {
    fontSize: 16,
  },
  clarificationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  clearClarificationText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  moreClarificationText: {
    fontSize: Typography.size.sm,
    color: Colors.salmon,
    fontWeight: Typography.weight.semibold,
  },

});
