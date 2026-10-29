import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { GradientFill } from '../../src/components/GradientBackground';
import { PageSetupDialog } from '../../src/components/editor/PageSetupDialog';
import { KeyboardToolbar } from '../../src/editor/iphone/KeyboardToolbar';
import { DEFAULT_PAGE_SETUP } from '../../src/editor/page/pageSetup';
import type { FormatState } from '../../src/editor/format';
import { MarkSheet } from '../../src/editor/iphone/MarkSheet';
import { FormulaSheet } from '../../src/editor/iphone/FormulaSheet';

/**
 * Development only: the iPhone's keyboard toolbar and Page setup sheet drawn
 * in a browser at the iPhone's width, from the same components, for
 * screenshots (there is no iPhone simulator on the build Mac). A release
 * build sends you home.
 *   /dev/editor-preview?show=toolbar     the keyboard toolbar (open its second row with the arrow)
 *   /dev/editor-preview?show=pagesetup   the Page setup sheet
 *   /dev/editor-preview?show=mark        a mark chip's sheet
 *   /dev/editor-preview?show=formula     the formula sheet (From the library shows the library)
 */
const STATE = { canUndo: true, canRedo: true, canIndent: true, canOutdent: true, bold: true, list: null } as unknown as FormatState;

export default function EditorPreview() {
  const { show } = useLocalSearchParams<{ show?: string }>();
  const [setup, setSetup] = useState(DEFAULT_PAGE_SETUP);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={styles.screen}>
      <GradientFill />
      <View style={styles.phone}>
        <View style={styles.flex} />
        {show === 'toolbar' && (
          <KeyboardToolbar
            state={STATE}
            run={() => {}}
            panel={undefined}
            onPanel={() => {}}
            onDone={() => {}}
            onLink={() => {}}
            onOpenLink={() => {}}
            onComment={() => {}}
            onPhotoLayout={() => {}}
            insert={{ photos: () => {}, table: () => {}, formula: () => {}, comment: () => {}, callout: () => {}, mark: () => {}, timestamp: () => {} }}
          />
        )}
      </View>
      {show === 'formula' && (
        <FormulaSheet draft={{ latex: '', display: false, existing: false }} onChange={() => {}} onDone={() => {}} onRemove={() => {}} onLibrary={() => {}} />
      )}
      {show === 'mark' && <MarkSheet draft={{ kind: 'confused', level: 7, existing: true }} onSubmit={() => {}} onRemove={() => {}} onClose={() => {}} />}
      {show === 'pagesetup' && (
        <PageSetupDialog visible setup={setup} pageless={false} onClose={() => {}} onApply={setSetup} onSetDefault={async () => {}} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  phone: { flex: 1, width: 390 },
  flex: { flex: 1 },
});
