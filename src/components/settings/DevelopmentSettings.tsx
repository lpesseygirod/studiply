/**
 * DevelopmentSettings.tsx
 * Development builds only (never in a release): the server badge, Simulate
 * offline, the sync panel, drag debugging and the earlier-version sample.
 * Moved from the old General screen (step 3.6).
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { showAlert } from '../dialogs/dialogs';
import { setSimulatedOffline, useSimulatedOffline } from '../../lib/connectivity';
import { setDragDebug, setPlainScroll, useDragDebug } from '../../lib/dnd/dragDebug';
import { BackendBadge } from '../BackendBadge';
import { SyncDebugPanel } from '../SyncDebugPanel';
import { legacyImportAvailable, setUseSampleData, usesSampleData } from '../../services/legacyImport';
import { createSampleEarlierVersion } from '../../services/legacyImport/sample';
import { SettingSwitch } from './PreferenceSettings';
import { makeSettingsStyles } from './styles';

export function DevelopmentSettings({ title = 'DEVELOPMENT' }: { title?: string | null }) {
  const styles = useThemedStyles(makeSettingsStyles);
  const { colors: c } = useTheme();
  const simulatedOffline = useSimulatedOffline();
  const dragDebug = useDragDebug();
  // Step 1.9 is tested on sample data, never the real earlier-version data.
  const [useSample, setUseSample] = useState(false);
  const [creatingSample, setCreatingSample] = useState(false);
  useEffect(() => {
    if (__DEV__) usesSampleData().then(setUseSample).catch(() => {});
  }, []);
  const toggleSample = async (on: boolean) => {
    await setUseSampleData(on);
    setUseSample(on);
  };
  const createSample = async () => {
    setCreatingSample(true);
    try {
      await createSampleEarlierVersion();
      await toggleSample(true);
      showAlert('Sample created', 'Open Settings → Earlier version data, or go to Home.');
    } catch (err) {
      showAlert('Could not create the sample', err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSample(false);
    }
  };

  if (!__DEV__) return null;
  return (
    <>
      {title !== null && <Text style={styles.sectionHeader}>{title}</Text>}
      <View style={local.backendRow}>
        <BackendBadge />
      </View>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.rowLabel}>Simulate offline</Text>
          <SettingSwitch value={simulatedOffline} onValueChange={setSimulatedOffline} />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <SyncDebugPanel />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <Text style={styles.rowLabel}>Drag debug overlay</Text>
          <SettingSwitch value={dragDebug.on} onValueChange={setDragDebug} accessibilityLabel="Drag debug overlay" />
        </View>
        <View style={styles.divider} />
        <View style={styles.toggleRow}>
          <Text style={styles.rowLabel}>Drag: plain ScrollView</Text>
          <SettingSwitch value={dragDebug.plainScroll} onValueChange={setPlainScroll} accessibilityLabel="Drag: plain ScrollView" />
        </View>
        {legacyImportAvailable && (
          <>
            <View style={styles.divider} />
            <View style={styles.toggleRow}>
              <Text style={styles.rowLabel}>Use sample earlier-version data</Text>
              <SettingSwitch value={useSample} onValueChange={toggleSample} />
            </View>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.toggleRow} onPress={createSample} disabled={creatingSample} activeOpacity={0.75}>
              <Text style={styles.rowLabel}>Create sample earlier-version data</Text>
              {creatingSample ? (
                <ActivityIndicator size="small" color={c.salmon} />
              ) : (
                <Ionicons name="add-circle-outline" size={20} color={c.salmon} />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </>
  );
}

const local = StyleSheet.create({
  backendRow: { marginTop: 4 },
});
