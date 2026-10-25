import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { isSessionLive } from '../lib/cache';
import { useConnectivity } from '../lib/connectivity';
import { onSyncEvent, syncEnabled, syncNow, syncOps, type SyncOp } from '../lib/sync';

// Development only (Settings → General → DEVELOPMENT): what the iPhone's sync
// queue holds, and a button to send it now. Each line shows the operation,
// how often it was tried, when it is tried next and the last error, so a
// queue that doesn't move says why.

function when(iso: string | null): string {
  if (!iso) return 'now';
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  return s <= 0 ? 'now' : s < 60 ? `in ${s} s` : `in ${Math.round(s / 60)} min`;
}

export function SyncDebugPanel() {
  const connection = useConnectivity();
  const [ops, setOps] = useState<SyncOp[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    syncOps()
      .then(setOps)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    return onSyncEvent((e) => {
      if (e.type === 'changed' || e.type === 'failed' || e.type === 'done') load();
    });
  }, [load]);

  if (!syncEnabled) return null;

  const sync = async () => {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
      load();
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.label}>
          Sync queue · {connection} · session {isSessionLive() ? 'ready' : 'not refreshed'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={sync} disabled={busy} activeOpacity={0.8}>
          {busy ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.buttonText}>Sync now</Text>}
        </TouchableOpacity>
      </View>
      {ops.length === 0 ? (
        <Text style={styles.op}>Nothing waiting.</Text>
      ) : (
        ops.map((op) => (
          <Text key={op.id} style={[styles.op, op.status === 'failed' && styles.failed]}>
            {op.kind} · {op.key.slice(0, 8)} · {op.status} · tries {op.attempts} · next {when(op.nextAttemptAt)}
            {op.lastError ? `\n  ${op.lastError}` : ''}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1, fontSize: Typography.size.sm, color: Colors.text.primary },
  button: {
    backgroundColor: Colors.button.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 92,
    alignItems: 'center',
  },
  buttonText: { color: Colors.button.primaryText, fontSize: Typography.size.sm, fontWeight: Typography.weight.semibold },
  op: { fontSize: Typography.size.xs, color: Colors.text.secondary },
  failed: { color: Colors.error },
});
