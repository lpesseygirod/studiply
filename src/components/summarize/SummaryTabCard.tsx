import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { EarlierNotesCard } from '../editor/EarlierNotesCard';
import { useLibraryUpdates } from '../../lib/cache/library';
import { latestSummaryRequest, recordedInChunks } from '../../services/summarize.service';
import type { Session } from '../../types/database';
import { openSummarize } from './summarizePanelState';

/**
 * A lecture's Summary tab before it has a summary (step 7.3):
 * - settings saved by the summarize panel: what was asked for ("≈ 1,440
 *   words · 4 takeaways · 7 questions"); the summary itself is written by
 *   step 7.4;
 * - else "Summarize this lecture", which opens the panel;
 * - a lecture recorded the earlier way (no chunks transcribed while it
 *   recorded) keeps "Process now", the earlier after-recording step.
 */
export function SummaryTabCard({ lectureId, title, status, recording }: { lectureId: string; title: string; status: Session['status'] | undefined; recording: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ preview: string | null; requested: boolean; chunks: boolean } | null>(null);

  const load = useCallback(async () => {
    const [request, chunks] = await Promise.all([latestSummaryRequest(lectureId).catch(() => null), recordedInChunks(lectureId)]);
    setState({ requested: !!request, preview: request?.settings?.preview ?? null, chunks });
  }, [lectureId]);
  useEffect(() => {
    void load();
  }, [load]);
  // A request saved (or synced) since.
  useLibraryUpdates(() => void load());

  if (!state) return null;
  const summarize = () => openSummarize({ lectureId, recording });
  if (state.requested) {
    return (
      <View {...{ dataSet: { summarize: 'requested' } }}>
        <EarlierNotesCard
          label="Summary settings saved"
          text={`${state.preview ? `${state.preview}. ` : ''}The summary is written here once summaries arrive in the next update. Your notes stay untouched in My notes.`}
          action="Change settings"
          onAction={summarize}
        />
      </View>
    );
  }
  if (state.chunks || recording) {
    return (
      <View {...{ dataSet: { summarize: 'none' } }}>
        <EarlierNotesCard label="No summary yet" text="This lecture hasn't been summarized yet." action="Summarize this lecture" onAction={summarize} />
      </View>
    );
  }
  return (
    <EarlierNotesCard
      label="No summary yet"
      text={status === 'completed' ? 'This lecture has no summary.' : "This lecture hasn't been summarized yet."}
      action={status === 'completed' ? undefined : 'Process now'}
      onAction={() => router.push({ pathname: '/record/post-session', params: { sessionId: lectureId, title } })}
    />
  );
}
