import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../src/hooks/useAuth';
import { Colors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import {
  getTrashItems,
  restoreItem,
  permanentlyDelete,
  emptyTrash,
  type TrashItem,
} from '../../../src/services/trash.service';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function typeLabel(type: TrashItem['type']): string {
  switch (type) {
    case 'project': return 'Project';
    case 'session': return 'Session';
    case 'folder':  return 'Folder';
    case 'note':    return 'Note';
  }
}

function typeIcon(type: TrashItem['type']): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'project': return 'folder';
    case 'session': return 'mic-outline';
    case 'folder':  return 'folder-open-outline';
    case 'note':    return 'document-text-outline';
  }
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function TrashScreen() {
  const insets = useSafeAreaInsets();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id ?? '';
  const router = useRouter();

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getTrashItems(userId);
      setItems(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchItems();
    setRefreshing(false);
  };

  const handleRestore = async (item: TrashItem) => {
    try {
      await restoreItem(item);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch {
      Alert.alert('Error', 'Could not restore item. Please try again.');
    }
  };

  const handleDelete = (item: TrashItem) => {
    Alert.alert(
      'Delete Permanently',
      `"${item.name}" will be permanently deleted and cannot be recovered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await permanentlyDelete(item);
              setItems(prev => prev.filter(i => i.id !== item.id));
            } catch {
              Alert.alert('Error', 'Could not delete item. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleEmptyTrash = () => {
    if (items.length === 0) return;
    Alert.alert(
      'Empty Recently Deleted',
      'All items will be permanently deleted and cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await emptyTrash(userId);
              setItems([]);
            } catch {
              Alert.alert('Error', 'Could not empty trash. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recently Deleted</Text>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handleEmptyTrash}
          disabled={items.length === 0}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={[styles.emptyAllText, items.length === 0 && styles.emptyAllTextDisabled]}>
            Empty
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subheader}>
        Items are deleted automatically after 30 days.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.salmon} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => `${item.type}-${item.id}`}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 32 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.salmon}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trash-outline" size={48} color={Colors.text.placeholder} />
              <Text style={styles.emptyTitle}>No deleted items</Text>
              <Text style={styles.emptyBody}>
                Items you delete will appear here for 30 days before being permanently removed.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name={typeIcon(item.type)} size={20} color={Colors.text.secondary} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {typeLabel(item.type)} · {item.daysRemaining} day{item.daysRemaining !== 1 ? 's' : ''} left
                </Text>
              </View>
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={() => handleRestore(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.restoreText}>Restore</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.deleteButton}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceMuted,
  },
  iconButton: {
    width: 60,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold as '700',
    color: Colors.text.primary,
  },
  emptyAllText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium as '500',
    color: Colors.error,
    textAlign: 'right',
  },
  emptyAllTextDisabled: {
    color: Colors.text.placeholder,
  },

  subheader: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  listContent: {
    paddingTop: 8,
    paddingHorizontal: 20,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium as '500',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  rowMeta: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  restoreButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.accentLight,
  },
  restoreText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold as '600',
    color: Colors.accent,
  },
  deleteButton: {
    padding: 4,
  },

  separator: {
    height: 8,
  },

  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold as '700',
    color: Colors.text.primary,
  },
  emptyBody: {
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.5,
  },
});
