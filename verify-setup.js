#!/usr/bin/env node

/**
 * Studiply Setup Verification Script
 * Run with: node verify-setup.js
 *
 * Studiply is offline-first: all data lives in a local SQLite database on the
 * device. There is no backend to configure, so this script checks the things
 * that can actually stop the app from running, and treats the AI keys as the
 * one optional extra.
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
let warnings = 0;

function check(label, condition, fix) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    if (fix) console.log(`     → Fix: ${fix}`);
    failed++;
  }
}

function warn(label, condition, note) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ⚠️  ${label}`);
    if (note) console.log(`     → ${note}`);
    warnings++;
  }
}

function fileExists(filePath) {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

function fileContains(filePath, text) {
  if (!fileExists(filePath)) return false;
  return fs.readFileSync(path.join(process.cwd(), filePath), 'utf8').includes(text);
}

function getEnvValue(key) {
  if (!fileExists('.env')) return null;
  const content = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function reportMissing(label, required) {
  const missing = required.filter((f) => !fileExists(f));
  check(
    `${label} (${required.length - missing.length}/${required.length})`,
    missing.length === 0,
    missing.length > 0 ? `Missing: ${missing.join(', ')}` : null,
  );
}

console.log('\n🔍 STUDIPLY SETUP VERIFICATION\n');
console.log('================================\n');

// ── 1. PROJECT STRUCTURE ──
console.log('📁 Project Structure\n');

check('package.json exists', fileExists('package.json'), 'Run: npx create-expo-app studiply');
check('app.json exists', fileExists('app.json'), 'Missing Expo config');
check('tsconfig.json exists', fileExists('tsconfig.json'), 'Missing TypeScript config');

reportMissing('Core library files', [
  'src/lib/db.ts',
  'src/lib/mappers.ts',
  'src/lib/session.ts',
]);

reportMissing('Service files', [
  'src/services/auth.service.ts',
  'src/services/ai.service.ts',
  'src/services/ai-usage.service.ts',
  'src/services/credit-check.service.ts',
  'src/services/export.service.ts',
  'src/services/folder.service.ts',
  'src/services/note.service.ts',
  'src/services/profile.service.ts',
  'src/services/project.service.ts',
  'src/services/search.service.ts',
  'src/services/session.service.ts',
  'src/services/settings.service.ts',
  'src/services/source-file.service.ts',
  'src/services/storage.service.ts',
  'src/services/transcript.service.ts',
  'src/services/trash.service.ts',
]);

reportMissing('Utility + type files', [
  'src/providers/AuthProvider.tsx',
  'src/hooks/useAuth.ts',
  'src/utils/initials.ts',
  'src/utils/tokens.ts',
  'src/utils/file-size.ts',
  'src/utils/permissions.ts',
  'src/utils/pdf-template.ts',
  'src/constants/colors.ts',
  'src/constants/typography.ts',
  'src/types/database.ts',
]);

// ── 2. SCREENS ──
console.log('\n📱 Screens\n');

reportMissing('Screens', [
  'app/_layout.tsx',
  'app/(auth)/_layout.tsx',
  'app/(auth)/onboarding.tsx',
  'app/(main)/_layout.tsx',
  'app/(main)/index.tsx',
  'app/(main)/search/index.tsx',
  'app/(main)/record/_layout.tsx',
  'app/(main)/record/index.tsx',
  'app/(main)/record/active.tsx',
  'app/(main)/record/post-session.tsx',
  'app/(main)/record/review.tsx',
  'app/(main)/library/index.tsx',
  'app/(main)/project/[id].tsx',
  'app/(main)/note/[id].tsx',
  'app/(main)/settings/_layout.tsx',
  'app/(main)/settings/index.tsx',
  'app/(main)/settings/general.tsx',
  'app/(main)/settings/account.tsx',
  'app/(main)/settings/security.tsx',
  'app/(main)/settings/trash.tsx',
]);

// ── 3. OFFLINE INTEGRITY ──
console.log('\n🔌 Offline Integrity\n');

const pkg = fileExists('package.json')
  ? JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
  : { dependencies: {} };
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

check(
  'No Supabase dependency',
  !deps['@supabase/supabase-js'],
  'Run: npm uninstall @supabase/supabase-js — the app is offline-only',
);
check(
  'No Supabase client module',
  !fileExists('src/lib/supabase.ts'),
  'Delete src/lib/supabase.ts — replaced by src/lib/db.ts',
);
check(
  'expo-sqlite registered in app.json',
  fileContains('app.json', 'expo-sqlite'),
  'Add "expo-sqlite" to expo.plugins in app.json',
);

// ── 4. DEPENDENCIES ──
console.log('\n📦 Dependencies\n');

const requiredDeps = [
  '@react-native-async-storage/async-storage',
  'expo-av',
  'expo-crypto',
  'expo-document-picker',
  'expo-file-system',
  'expo-image-picker',
  'expo-linear-gradient',
  'expo-print',
  'expo-router',
  'expo-sharing',
  'expo-sqlite',
];
const missingDeps = requiredDeps.filter((d) => !deps[d]);
check(
  `Required packages installed (${requiredDeps.length - missingDeps.length}/${requiredDeps.length})`,
  missingDeps.length === 0,
  missingDeps.length > 0 ? `Run: npx expo install ${missingDeps.join(' ')}` : null,
);
check('node_modules exists', fileExists('node_modules'), 'Run: npm install');

// Every plugin listed in app.json must actually be installed, or the config
// fails to resolve at build time with a confusing error.
if (fileExists('app.json')) {
  const appJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8'));
  const expo = appJson.expo || appJson;
  const pluginNames = (expo.plugins || []).map((p) => (Array.isArray(p) ? p[0] : p));
  const orphanPlugins = pluginNames.filter((n) => n.startsWith('expo-') && !deps[n]);
  check(
    'Every app.json plugin is installed',
    orphanPlugins.length === 0,
    orphanPlugins.length > 0
      ? `Listed in plugins but not installed: ${orphanPlugins.join(', ')}`
      : null,
  );
}

// ── 5. AI KEYS (optional) ──
console.log('\n🔑 AI Keys (optional)\n');

warn('.env file exists', fileExists('.env'), 'Optional — copy .env.example to .env to add AI keys');

const openaiKey = getEnvValue('EXPO_PUBLIC_OPENAI_API_KEY');
const anthropicKey = getEnvValue('EXPO_PUBLIC_ANTHROPIC_API_KEY');

const hasOpenAI =
  openaiKey && openaiKey !== 'your_openai_api_key_here' && openaiKey.startsWith('sk-');
const hasAnthropic =
  anthropicKey &&
  anthropicKey !== 'your_anthropic_api_key_here' &&
  anthropicKey.startsWith('sk-ant');

warn(
  'OpenAI API key is set',
  hasOpenAI,
  'Optional — without it transcription is simulated. Key from platform.openai.com',
);
warn(
  'Anthropic API key is set',
  hasAnthropic,
  'Optional — without it note generation is simulated. Key from console.anthropic.com',
);

if (hasOpenAI && hasAnthropic) {
  console.log('  🟢 AI Mode: REAL — transcription and notes use live AI');
} else if (hasOpenAI || hasAnthropic) {
  console.log('  🟡 AI Mode: PARTIAL — one key missing, that half is simulated');
} else {
  console.log('  🟠 AI Mode: SIMULATED — the app works fully; AI output is placeholder');
}

// ── 6. APP CONFIG ──
console.log('\n⚙️  App Configuration\n');

if (fileExists('app.json')) {
  const appJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8'));
  const expo = appJson.expo || appJson;

  check(
    'App scheme is "studiply"',
    expo.scheme === 'studiply',
    'Add "scheme": "studiply" to app.json',
  );
  warn('iOS bundleIdentifier set', expo.ios?.bundleIdentifier, 'Needed for device builds');
  warn('Android package set', expo.android?.package, 'Needed for device builds');
}

// ── 7. SECURITY ──
console.log('\n🔒 Security\n');

check('.gitignore exists', fileExists('.gitignore'), 'Create .gitignore');
if (fileExists('.gitignore')) {
  check(
    '.env is in .gitignore',
    fileContains('.gitignore', '.env'),
    'Add .env to .gitignore — NEVER commit API keys',
  );
}

// ── SUMMARY ──
console.log('\n================================');
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings\n`);
console.log('  ℹ️  Run "npx tsc --noEmit" to verify zero type errors.');

if (failed === 0 && warnings === 0) {
  console.log('\n🎉 Everything looks perfect! Run "npx expo start" to launch.\n');
} else if (failed === 0) {
  console.log('\n✅ All critical checks passed. Warnings are optional.');
  console.log('   Run "npx expo start" to launch.\n');
} else {
  console.log('\n⚠️  Fix the failed checks above before running the app.\n');
}

process.exit(failed > 0 ? 1 : 0);
