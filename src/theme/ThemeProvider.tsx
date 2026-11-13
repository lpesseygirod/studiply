import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { DarkColors, LightColors, type ThemeColors } from '../constants/colors';
import { readAppearance, saveAppearance, schemeFor, type Appearance, type Scheme } from './appearance';

/**
 * The light or dark palette for the whole app: the system's
 * scheme, unless the student chose Light or Dark in Settings.
 */

interface Theme {
  scheme: Scheme;
  colors: ThemeColors;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
}

const ThemeContext = createContext<Theme>({
  scheme: 'light',
  colors: LightColors,
  appearance: 'system',
  setAppearance: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');

  useEffect(() => {
    readAppearance().then(setAppearanceState);
  }, []);

  const setAppearance = useCallback((value: Appearance) => {
    setAppearanceState(value);
    saveAppearance(value);
  }, []);

  const scheme = schemeFor(appearance, system);
  const theme = useMemo(
    () => ({ scheme, colors: scheme === 'dark' ? DarkColors : LightColors, appearance, setAppearance }),
    [scheme, appearance, setAppearance],
  );
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles built from the current palette, rebuilt only when it changes.
 * `factory` must be defined at module level (it is the cache key).
 */
const cache = new WeakMap<object, Partial<Record<Scheme, unknown>>>();

/** The styles of `factory` for a scheme, built once per scheme. */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: ThemeColors) => T, scheme: Scheme): T {
  let entry = cache.get(factory);
  if (!entry) {
    entry = {};
    cache.set(factory, entry);
  }
  if (!entry[scheme]) entry[scheme] = StyleSheet.create(factory(scheme === 'dark' ? DarkColors : LightColors));
  return entry[scheme] as T;
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: ThemeColors) => T): T {
  return themedStyles(factory, useTheme().scheme);
}

/**
 * The status bar over the gradient: dark text in both appearances (the
 * dark gradient is the light one dimmed, with dark text on it).
 */
export function ThemedStatusBar() {
  return <StatusBar style="dark" />;
}
