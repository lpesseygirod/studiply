import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import { searchAll } from '../../../src/services/search.service';
import type { SearchResult } from '../../../src/types/database';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus input whenever this tab becomes active.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }, [])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      if (!profile?.id) {
        setIsSearching(false);
        return;
      }
      try {
        const data = await searchAll(profile.id, q);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [query, profile?.id]);

  const handleResultPress = (result: SearchResult) => {
    Keyboard.dismiss();
    if (result.type === 'project') {
      router.push(`/project/${result.id}`);
    } else {
      // Both 'session' and 'note' navigate to the note/session view.
      // For 'note', id is already the session_id.
      router.push(`/note/${result.id}`);
    }
  };

  const resultIcon = (type: SearchResult['type']) => {
    if (type === 'project') return 'folder-outline' as const;
    if (type === 'note') return 'book-outline' as const;
    return 'document-text-outline' as const;
  };

  const resultTypeLabel = (type: SearchResult['type']) => {
    if (type === 'project') return 'Project';
    if (type === 'note') return 'Note';
    return 'Session';
  };

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={() => handleResultPress(item)}
      activeOpacity={0.75}
    >
      <View style={styles.resultIcon}>
        <Ionicons
          name={resultIcon(item.type)}
          size={20}
          color={Colors.text.secondary}
        />
      </View>
      <View style={styles.resultText}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.resultType}>
          {resultTypeLabel(item.type)}
          {item.subtitle ? ` · ${item.subtitle}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.text.placeholder} />
    </TouchableOpacity>
  );

  const showEmpty = query.trim() && !isSearching && results.length === 0;
  const showPrompt = !query.trim();

  return (
    <View style={styles.container}>
        <StatusBar style="dark" />

        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.appTitle}>STUDIPLY</Text>

          {/* Search input + Cancel */}
          <View style={styles.searchRow}>
            <View style={styles.searchBarWrapper}>
              <Ionicons name="search-outline" size={16} color={Colors.text.primary} style={styles.searchIcon} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Search"
                placeholderTextColor={Colors.text.primary}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isSearching && (
                <ActivityIndicator size="small" color={Colors.text.secondary} style={styles.searchSpinner} />
              )}
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
        </View>

        {showPrompt ? (
          <Pressable style={styles.promptState} onPress={Keyboard.dismiss}>
            <Text style={styles.promptText}>Search projects, notes, and sessions</Text>
          </Pressable>
        ) : showEmpty ? (
          <Pressable style={styles.promptState} onPress={Keyboard.dismiss}>
            <Text style={styles.promptText}>No results found</Text>
          </Pressable>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => `${item.type}-${item.id}`}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF9',
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    backgroundColor: '#FFFDF9',
  },
  appTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.extrabold,
    color: Colors.text.primary,
    letterSpacing: Typography.tracking.widest,
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
    backgroundColor: Colors.salmon,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
  },
  cancelButton: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
    padding: 0,
  },
  searchSpinner: {
    flexShrink: 0,
  },

  // Results list
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.salmonLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultText: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  resultType: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: Typography.tracking.wide,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.surfaceMuted,
    marginLeft: 48,
  },

  // Prompt / empty
  promptState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  promptText: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },
});
