import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { supabaseUrl } from '../lib/supabase';
import { describeBackend } from '../lib/supabaseUrl';
import { useThemedStyles } from '../theme/ThemeProvider';

/** The server this build talks to: what a development build's uploads go to. */
export const backend = describeBackend(supabaseUrl);

/**
 * Development builds only: "LOCAL" or "REMOTE (xmym…)", so it's always clear
 * where an upload goes (Settings → DEVELOPMENT, the Earlier version screen).
 */
export function BackendBadge() {
  const styles = useThemedStyles(makeStyles);
  if (!__DEV__) return null;
  const remote = backend.kind === 'remote';
  return (
    <View
      style={[styles.badge, remote ? styles.remote : styles.local]}
      accessibilityLabel={`Server: ${remote ? `remote project ${backend.ref}` : 'local Supabase'}`}
      testID="backend-badge"
    >
      <Text style={[styles.text, remote ? styles.remoteText : styles.localText]}>Server: {backend.label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
    local: { backgroundColor: c.status.info.bg, borderColor: c.status.info.border },
    remote: { backgroundColor: c.status.warning.bg, borderColor: c.status.warning.border },
    text: { fontSize: Typography.size.xs, fontWeight: Typography.weight.bold, letterSpacing: 0.5 },
    localText: { color: c.status.info.text },
    remoteText: { color: c.status.warning.text },
  });
