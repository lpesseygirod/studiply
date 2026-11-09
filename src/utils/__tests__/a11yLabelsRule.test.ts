// Step 10.1b-5: the local ESLint rule studiply/a11y-labels (eslint/a11y-labels.js) flags icon-only
// buttons and images without a name, and lets named, texted or hidden ones through.
/* eslint-disable @typescript-eslint/no-require-imports */
const { RuleTester } = require('eslint') as typeof import('eslint');
const rule = require('../../../eslint/a11y-labels');

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } } });

// RuleTester declares its own describe / it blocks (one test per case).
tester.run('studiply/a11y-labels', rule, {
    valid: [
      '<Pressable onPress={go}><Text>Save</Text></Pressable>',
      '<Pressable onPress={go} accessibilityLabel="Close"><Ionicons name="close" /></Pressable>',
      '<TouchableOpacity onPress={go} aria-label="Close"><Ionicons name="close" /></TouchableOpacity>',
      '<TouchableOpacity onPress={go}>{label}</TouchableOpacity>',
      '<TouchableOpacity onPress={go}><View><Text>{n}</Text></View></TouchableOpacity>',
      '<Pressable onPress={go}>{({ pressed }) => <Text>Go</Text>}</Pressable>',
      '<Pressable onPress={go}>{busy ? <ActivityIndicator /> : <Text>Send</Text>}</Pressable>',
      '<Pressable onPress={go}><CheckRow title="Notes" /></Pressable>',
      '<TouchableWithoutFeedback onPress={dismiss} accessible={false}><View /></TouchableWithoutFeedback>',
      '<Pressable {...props}><Ionicons name="close" /></Pressable>',
      '<Image source={s} accessibilityLabel="Board photo" />',
      '<Image source={s} accessible={false} />',
      '<Image source={s} alt="Board" />',
      '<Image source={s} aria-hidden />',
      '<Switch value={on} onValueChange={set} accessibilityLabel="Extract formulas" />',
      '<SettingSwitch value={on} onValueChange={set} accessibilityLabel={t.label} />',
      '<Switch {...props} />',
    ],
    invalid: [
      { code: '<Pressable onPress={go}><Ionicons name="close" /></Pressable>', errors: [{ messageId: 'pressable' }] },
      { code: '<TouchableOpacity onPress={go}><View><MaterialCommunityIcons name="x" /></View></TouchableOpacity>', errors: [{ messageId: 'pressable' }] },
      { code: '<TouchableOpacity style={s} onPress={close} />', errors: [{ messageId: 'pressable' }] },
      { code: '<Pressable onPress={go} {...a11yState({ selected: on })}>{on ? <Ionicons name="a" /> : <Ionicons name="b" />}</Pressable>', errors: [{ messageId: 'pressable' }] },
      { code: '<Image source={s} />', errors: [{ messageId: 'image' }] },
      { code: '<Switch value={on} onValueChange={set} />', errors: [{ messageId: 'switch' }] },
      { code: '<SettingSwitch value={on} onValueChange={set} />', errors: [{ messageId: 'switch' }] },
    ],
});
