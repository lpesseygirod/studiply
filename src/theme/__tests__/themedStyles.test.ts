import { StyleSheet } from 'react-native';

import { DarkColors, LightColors, type ThemeColors } from '../../constants/colors';
import { themedStyles } from '../ThemeProvider';

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

describe('themedStyles', () => {
  it('builds each screen\'s styles from the palette of the scheme, once per scheme', () => {
    const factory = jest.fn((c: ThemeColors) => StyleSheet.create({ card: { backgroundColor: c.card } }));
    expect(StyleSheet.flatten(themedStyles(factory, 'light').card).backgroundColor).toBe(LightColors.card);
    expect(StyleSheet.flatten(themedStyles(factory, 'dark').card).backgroundColor).toBe(DarkColors.card);
    themedStyles(factory, 'dark');
    themedStyles(factory, 'light');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
