// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Alert with buttons, Alert.prompt and ActionSheetIOS do nothing in a
// browser; screens use src/components/dialogs instead.
const WEB_SILENT_DIALOGS = 'Does nothing on the web: use showAlert / showActionSheet / promptText from src/components/dialogs.';

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno (npm: imports, Deno globals), not in the app.
    ignores: ['dist/*', 'supabase/functions/**'],
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
]);
