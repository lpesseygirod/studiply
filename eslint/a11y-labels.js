/**
 * studiply/a11y-labels — a local ESLint rule (no npm package): a pressable that shows
 * no text (an icon-only button) and every image must have a name for screen readers, or be hidden
 * from them on purpose.
 *
 *   Pressable, TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback:
 *     fine with accessibilityLabel / aria-label / aria-labelledby, or accessible={false} /
 *     aria-hidden, or any text inside (a <Text>, words, a value in {…}, a custom component that may
 *     draw text). Flagged when everything inside is icons, views, images or spinners.
 *   Switch, SettingSwitch: always need accessibilityLabel / aria-label (a switch's
 *     row text is beside it, not in it, so the switch itself was read without a name).
 *   Image (react-native, expo-image):
 *     fine with accessibilityLabel / aria-label / alt, or accessible={false} / aria-hidden /
 *     accessibilityElementsHidden / importantForAccessibility="no…" (decorative).
 *
 * Spreads like {...props} may carry a label, so they count as one; {...a11yState(…)},
 * {...{ dataSet }} and other calls or objects don't.
 */

const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback']);
/** A switch draws no text of its own: it always needs a label (the row's text). */
const SWITCHES = new Set(['Switch', 'SettingSwitch']);
const IMAGES = new Set(['Image', 'ExpoImage']);
const LABELS = new Set(['accessibilityLabel', 'aria-label', 'aria-labelledby', 'accessibilityLabelledBy']);
/** Components that never draw text themselves. */
const SILENT = new Set(['View', 'Image', 'ExpoImage', 'ActivityIndicator', 'LinearGradient', 'Svg', 'Path', 'Circle', 'Rect', 'G', 'Line', 'Polyline', 'Polygon', 'LogoTile', 'GradientFill', 'CheckBox', 'Avatar', 'UserAvatar']);
const isIcon = (name) => /Icons?$/.test(name) || /^(Ionicons|MaterialCommunityIcons|MaterialIcons|Feather|FontAwesome\d?|AntDesign|Entypo|Octicons)$/.test(name);

function elementName(opening) {
  const n = opening.name;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return n.property.name; // Animated.Image → Image
  return '';
}

function attr(opening, name) {
  return opening.attributes.find((a) => a.type === 'JSXAttribute' && a.name && a.name.name === name);
}

function literalValue(a) {
  if (!a || !a.value) return a ? true : undefined; // <X accessible /> → true
  if (a.value.type === 'Literal') return a.value.value;
  if (a.value.type === 'JSXExpressionContainer' && a.value.expression.type === 'Literal') return a.value.expression.value;
  return '(expression)';
}

function forwardsProps(opening) {
  return opening.attributes.some((a) => a.type === 'JSXSpreadAttribute' && a.argument.type === 'Identifier');
}

function named(opening, image) {
  for (const name of LABELS) if (attr(opening, name)) return true;
  if (image && attr(opening, 'alt')) return true;
  if (literalValue(attr(opening, 'accessible')) === false) return true;
  const hidden = literalValue(attr(opening, 'aria-hidden'));
  if (hidden === true || hidden === '(expression)') return true;
  if (attr(opening, 'accessibilityElementsHidden')) return true;
  const important = literalValue(attr(opening, 'importantForAccessibility'));
  if (typeof important === 'string' && important.startsWith('no')) return true;
  return forwardsProps(opening);
}

/** Every JSX element or fragment inside an expression (render props, conditionals, maps…). */
function jsxIn(node, out = [], seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    out.push(node);
    return out;
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((x) => jsxIn(x, out, seen));
    else if (v && typeof v === 'object' && typeof v.type === 'string') jsxIn(v, out, seen);
  }
  return out;
}

/** Whether these children may show text (true when unsure). */
function mayShowText(children) {
  for (const child of children) {
    if (child.type === 'JSXText') {
      if (child.value.trim()) return true;
    } else if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type === 'JSXEmptyExpression') continue;
      const found = jsxIn(child.expression);
      if (!found.length) return true; // {label}, {children}, {`…`}: text, as far as we can tell
      if (found.some((el) => mayShowText([el]))) return true;
    } else if (child.type === 'JSXFragment') {
      if (mayShowText(child.children)) return true;
    } else if (child.type === 'JSXElement') {
      const name = elementName(child.openingElement);
      if (/Text$/.test(name)) return true;
      if (isIcon(name) || SILENT.has(name)) {
        if (mayShowText(child.children)) return true;
        continue;
      }
      // A component of ours may draw text (a label prop, its own <Text>): give it the benefit of the doubt.
      return true;
    }
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Icon-only buttons and images need a name for screen readers (step 10.1b-5).' },
    schema: [],
    messages: {
      pressable: '{{name}} shows no text: give it an accessibilityLabel (what it does), or accessible={false} if it is not a control.',
      image: 'Image needs an accessibilityLabel (what it shows), or accessible={false} if it is only decoration.',
      switch: '{{name}} needs an accessibilityLabel: the text of its row, read for the switch itself.',
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        const opening = node.openingElement;
        const name = elementName(opening);
        if (PRESSABLES.has(name)) {
          if (named(opening, false) || mayShowText(node.children)) return;
          context.report({ node: opening, messageId: 'pressable', data: { name } });
        } else if (IMAGES.has(name)) {
          if (named(opening, true)) return;
          context.report({ node: opening, messageId: 'image' });
        } else if (SWITCHES.has(name)) {
          if (named(opening, false)) return;
          context.report({ node: opening, messageId: 'switch', data: { name } });
        }
      },
    };
  },
};
