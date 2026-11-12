import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { useLayoutMode } from '../../../src/hooks/useLayoutMode';
import { ThemedStatusBar, useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { useShellCommand } from '../../../src/components/shell/ShellContext';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { a11yState } from '../../../src/utils/a11y';
import { searchLibrary, type SearchHit } from '../../../src/services/search.service';
import { isNetworkError } from '../../../src/lib/cloudRows';
import { resultCountLine, searchQuery, snippetAround } from '../../../src/utils/searchText';
import { hitBadge, hitsForChip, hitTarget, isTitleHit, SEARCH_CHIPS, type SearchChip } from '../../../src/utils/searchHit';
import FoundText from '../../../src/components/FoundText';
import { GradientFill } from '../../../src/components/GradientBackground';

const DEBOUNCE_MS = 250;
// The chips are ~33 pt tall (as on Library); their touch area reaches 44.
const CHIP_SLOP = { top: 6, bottom: 6, left: 2, right: 2 };

type Status = 'idle' | 'searching' | 'done' | 'needsConnection' | 'failed';

/**
 * Search (docs/design iphone-09): titles, notes, terms and
 * transcripts, without caring about case or accents. Chips narrow the
 * results; each row shows its course colour, title, what was found
 * ("Transcript 18:22") and the text around the match. Offline on the
 * iPhone it searches what is on the iPhone and says so.
 */
export default function SearchScreen() {
  const wide = useLayoutMode() === 'wide';
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<SearchChip>('all');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState('');
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const request = useRef(0);

  // "/" on the web while Search is open: back to the field.
  useShellCommand('focusSearch', () => inputRef.current?.focus());

  // Auto-focus input whenever this tab becomes active.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }, []),
  );

  useEffect(() => {
    const id = ++request.current;
    if (!searchQuery(query)) {
      setHits([]);
      setSearched('');
      setStatus('idle');
      return;
    }
    setStatus('searching');
    const timer = setTimeout(async () => {
      try {
        const answer = await searchLibrary(query);
        if (id !== request.current) return; // a newer search is on its way
        setHits(answer.hits);
        setOfflineOnly(answer.offline);
        setSearched(query);
        setStatus('done');
      } catch (err) {
        if (id !== request.current) return;
        setHits([]);
        setStatus(isNetworkError(err) ? 'needsConnection' : 'failed');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const open = (hit: SearchHit) => {
    Keyboard.dismiss();
    router.push(hitTarget(hit));
  };

  const shown = hitsForChip(hits, chip);

  const renderItem = ({ item }: { item: SearchHit }) => {
    const title = isTitleHit(item);
    const place = item.kind === 'course' ? null : item.courseName;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => open(item)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${hitBadge(item)}`}
      >
        <View style={styles.rowTop}>
          <View style={[styles.courseDot, { backgroundColor: item.courseColor ?? c.accent }]} />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title ? <FoundText text={item.title} find={searched} /> : item.title}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {hitBadge(item)}
            </Text>
          </View>
        </View>
        {title ? (
          !!place && (
            <Text style={styles.snippet} numberOfLines={1}>
              {place}
            </Text>
          )
        ) : (
          <Text style={styles.snippet} numberOfLines={2}>
            <FoundText text={snippetAround(item.matched, searched)} find={searched} />
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const message =
    status === 'idle'
      ? 'Search titles, notes and transcripts'
      : status === 'needsConnection'
        ? 'Search needs a connection.'
        : status === 'failed'
          ? 'Search failed. Please try again.'
          : status === 'done' && shown.length === 0
            ? hits.length === 0
              ? `No results for “${searched.trim()}”`
              : 'Nothing of this kind. Try All.'
            : null;

  return (
    <View style={styles.container}>
      <GradientFill />
      <ThemedStatusBar />

      <View style={[styles.header, wide && styles.headerWide, { paddingTop: wide ? 24 : insets.top + 20 }]}>
        {!wide && <Text style={styles.appTitle}>Search</Text>}

        {/* Search input + Cancel */}
        <View style={styles.searchRow}>
          <View style={styles.searchBarWrapper}>
            <Ionicons name="search-outline" size={16} color={c.search.text} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search notes, lectures, terms…"
              placeholderTextColor={c.search.placeholder}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search"
            />
            {status === 'searching' && <ActivityIndicator size="small" color={c.text.secondary} style={styles.searchSpinner} />}
          </View>
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              setQuery('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {SEARCH_CHIPS.map(({ key, label }) => {
            const active = key === chip;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, active && styles.chipActive]}
                hitSlop={CHIP_SLOP}
                onPress={() => setChip(key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                {...a11yState({ selected: active })}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} maxFontSizeMultiplier={1.6}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {status === 'done' && shown.length > 0 && <Text style={styles.countLine}>{resultCountLine(shown)}</Text>}
        {status === 'done' && offlineOnly && (
          <View style={styles.offlineLine}>
            <Ionicons name="cloud-offline-outline" size={14} color={c.text.onGradient} />
            <Text style={styles.offlineText}>Searching only what&apos;s on this iPhone</Text>
          </View>
        )}
      </View>

      {message !== null ? (
        <Pressable style={styles.promptState} onPress={Keyboard.dismiss}>
          <Text style={styles.promptText}>{message}</Text>
        </Pressable>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(item, i) => `${item.kind}-${item.itemId}-${item.tMs ?? item.field}-${i}`}
          renderItem={renderItem}
          style={[styles.list, wide && styles.listWide]}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const WIDE_MAX = 760;

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 24,
      paddingBottom: 8,
    },
    headerWide: {
      width: '100%',
      maxWidth: WIDE_MAX,
      alignSelf: 'center',
    },
    // The big screen title, as on Library (docs/design iphone-09)
    appTitle: {
      fontSize: Typography.size['3xl'],
      fontWeight: Typography.weight.extrabold,
      color: c.text.onGradientStrong,
      marginBottom: 14,
    },

    // Search bar
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    searchBarWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.search.bg,
      borderWidth: 1,
      borderColor: c.search.border,
      borderRadius: 100,
      paddingHorizontal: 18,
      paddingVertical: 12,
      gap: 8,
    },
    cancelButton: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.text.onGradientStrong,
    },
    searchIcon: {
      flexShrink: 0,
    },
    searchInput: {
      flex: 1,
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.medium,
      color: c.search.text,
      padding: 0,
    },
    searchSpinner: {
      flexShrink: 0,
    },

    // Chips (as on Library)
    chipsScroll: { flexGrow: 0, marginHorizontal: -24, marginTop: 14 },
    chips: { gap: 8, paddingHorizontal: 24, alignItems: 'flex-start' },
    chip: {
      backgroundColor: c.white,
      borderRadius: 100,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    chipActive: { backgroundColor: c.button.primary },
    chipText: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.medium,
      color: c.text.primary,
    },
    chipTextActive: { color: c.button.primaryText, fontWeight: Typography.weight.semibold },

    countLine: {
      marginTop: 14,
      fontSize: Typography.size.sm,
      color: c.text.onGradient,
    },
    offlineLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    offlineText: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.medium,
      color: c.text.onGradient,
    },

    // Results sit on a card (readable on the gradient in both appearances)
    list: {
      marginBottom: 12,
    },
    listWide: {
      width: '100%',
      maxWidth: WIDE_MAX,
      alignSelf: 'center',
    },
    listContent: {
      marginHorizontal: 18,
      marginTop: 6,
      paddingHorizontal: 16,
      backgroundColor: c.card,
      borderRadius: 18,
    },
    row: {
      paddingVertical: 12,
      gap: 4,
    },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    courseDot: {
      width: 8,
      height: 8,
      borderRadius: 2,
      flexShrink: 0,
    },
    rowTitle: {
      flex: 1,
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text.primary,
    },
    badge: {
      flexShrink: 0,
      backgroundColor: c.accentLight,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      maxWidth: 160,
    },
    badgeText: {
      fontSize: Typography.size.xs,
      fontWeight: Typography.weight.semibold,
      color: c.accentDark,
    },
    snippet: {
      fontSize: Typography.size.sm,
      color: c.text.secondary,
      lineHeight: Typography.size.sm * Typography.leading.relaxed,
      marginLeft: 16,
    },
    separator: {
      height: 1,
      backgroundColor: c.surfaceMuted,
    },

    // Prompt / empty
    promptState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 60,
      paddingHorizontal: 24,
    },
    promptText: {
      fontSize: Typography.size.base,
      color: c.text.onGradient,
      textAlign: 'center',
    },
  });
