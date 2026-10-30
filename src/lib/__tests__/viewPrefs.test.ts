import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_VIEW, effectiveZoom, readViewPrefs, saveViewPrefs, stepZoom } from '../viewPrefs';

beforeEach(() => AsyncStorage.clear());

describe('viewPrefs (step 4.5b)', () => {
  it('the laptop starts in Pages at Fit, the iPhone Pageless at 100 %', async () => {
    expect(await readViewPrefs('laptop')).toEqual({ pages: true, zoom: 'fit' });
    expect(await readViewPrefs('iphone')).toEqual({ pages: false, zoom: 1 });
  });

  it('each device keeps its own; anything unusable falls back', async () => {
    await saveViewPrefs('laptop', { pages: false, zoom: 1.5 });
    await saveViewPrefs('iphone', { pages: true, zoom: 0.75 });
    expect(await readViewPrefs('laptop')).toEqual({ pages: false, zoom: 1.5 });
    expect(await readViewPrefs('iphone')).toEqual({ pages: true, zoom: 0.75 });
    await AsyncStorage.setItem('studiply.view', '{"laptop":{"pages":"yes","zoom":9}}');
    expect(await readViewPrefs('laptop')).toEqual(DEFAULT_VIEW.laptop);
    await AsyncStorage.setItem('studiply.view', 'not json');
    expect(await readViewPrefs('iphone')).toEqual(DEFAULT_VIEW.iphone);
  });

  it('⌘+ / ⌘− step through 50–200 %, from any zoom', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(0.74, 1)).toBe(0.75);
    expect(stepZoom(0.74, -1)).toBe(0.5);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it('Fit: the sheet as wide as the column, never above 100 % (or below 50 %); Pageless is 100 %', () => {
    expect(effectiveZoom('fit', true, 588, 794)).toBe(0.74);
    expect(effectiveZoom('fit', true, 1200, 794)).toBe(1);
    // Phone width (390 px: about 302 px for the sheet): the A4 page fits, below the steps' 50 %.
    expect(effectiveZoom('fit', true, 302, 794)).toBe(0.38);
    expect(effectiveZoom('fit', true, 100, 794)).toBe(0.25);
    expect(effectiveZoom('fit', false, 588, 794)).toBe(1);
    expect(effectiveZoom(1.5, true, 588, 794)).toBe(1.5);
  });
});
