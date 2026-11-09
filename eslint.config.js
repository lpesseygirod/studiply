// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
// Step 10.1b-5: icon-only buttons and images are named for screen readers (a local rule, no package).
const a11yLabels = require('./eslint/a11y-labels');

// Alert with buttons, Alert.prompt and ActionSheetIOS do nothing in a
// browser; screens use src/components/dialogs instead.
const WEB_SILENT_DIALOGS = 'Does nothing on the web: use showAlert / showActionSheet / promptText from src/components/dialogs.';

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno (npm: imports, Deno globals), not in the app;
    // editor-web/build is the generated WebView editor (npm run editor:build);
    // _to_delete holds files moved out of the app (Lea's rule: moved, never deleted).
    ignores: ['dist/*', 'supabase/functions/**', 'editor-web/build/**', '_to_delete/**'],
  },
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/components/dialogs/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Alert', property: 'alert', message: WEB_SILENT_DIALOGS },
        { object: 'Alert', property: 'prompt', message: WEB_SILENT_DIALOGS },
        { object: 'ActionSheetIOS', property: 'showActionSheetWithOptions', message: WEB_SILENT_DIALOGS },
      ],
    },
  },
  {
    files: ['app/**/*.tsx', 'src/**/*.tsx'],
    ignores: ['**/__tests__/**'],
    plugins: { studiply: { rules: { 'a11y-labels': a11yLabels } } },
    rules: { 'studiply/a11y-labels': 'error' },
  },
]);
