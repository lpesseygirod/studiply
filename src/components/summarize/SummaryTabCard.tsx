import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { useCreditUnits } from '../../hooks/useCredits';
import { BUY_ON_IPHONE } from '../../lib/credits/format';
import { EarlierNotesCard } from '../editor/EarlierNotesCard';
import { showAlert } from '../dialogs/dialogs';
import { useLibraryUpdates } from '../../lib/cache/library';
import { ConsentDeclinedError } from '../../services/consent.service';
import { latestSummary, recordedInChunks, retrySummary, startSummary, type LectureSummary } from '../../services/summarize.service';
import { errorMessage } from '../../utils/errors';
import { summaryCardText } from './summaryCard';
import { openSummarize } from './summarizePanelState';

/** How often the card reads the row while the summary is being written. */
const POLL_MS = 5000;

/**
 * A lecture's Summary tab before the summary is written into it:
 * - a summary of the summarize panel, by status: saved but not started ("Summarize now"), being written
 *   (read again every few seconds), ready (its counts and takeaways), or failed (why, and Try again);
 * - else "Summarize this lecture", which opens the panel;
 * - a lecture recorded the earlier way (no chunks transcribed while it recorded) just says it has no summary.
 */
export function SummaryTabCard({ lectureId, recording }: { lectureId: string; recording: boolean }) {
  const [state, setState] = useState<{ summary: LectureSummary | null; chunks: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const creditUnits = useCreditUnits();

  const load = useCallback(async () => {
    const [summary, chunks] = await Promise.all([latestSummary(lectureId).catch(() => null), recordedInChunks(lectureId)]);
    setState({ summary, chunks });
  }, [lectureId]);
  useEffect(() => {
    void load();
  }, [load]);
  // A request saved (or synced) since.
  useLibraryUpdates(() => void load());
  // While it's being written, the row is read again.
  const writing = state?.summary?.status === 'generating' || state?.summary?.status === 'checking';
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [writing, load]);

  if (!state) return null;
  const summarize = () => openSummarize({ lectureId, recording });

  const s = state.summary;
  if (s) {
    const card = summaryCardText(s, { units: creditUnits, buy: Platform.OS === 'ios' ? undefined : BUY_ON_IPHONE });
    const act = async () => {
      if (busy) return;
      if (card.action === 'settings') return summarize();
      setBusy(true);
      try {
        if (card.action === 'start') await startSummary(lectureId, s.id, { media: !!(s.settings?.resources.photos || s.settings?.resources.slides) });
        else await retrySummary(lectureId, s);
      } catch (err) {
        if (!(err instanceof ConsentDeclinedError)) showAlert('The summary didn’t start', errorMessage(err, 'Please try again.'));
      } finally {
        setBusy(false);
        void load();
      }
    };
    return (
      <View {...{ dataSet: { summarize: s.status === 'done' ? 'done' : s.status === 'failed' ? 'failed' : 'requested', status: s.status } }}>
        <EarlierNotesCard
          label={card.label}
          text={card.text}
          action={card.action === 'start' ? 'Summarize now' : card.action === 'retry' ? 'Try again' : card.action === 'settings' ? 'Change settings' : undefined}
          onAction={() => void act()}
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
  return <EarlierNotesCard label="No summary yet" text="This lecture has no summary." />;
}
