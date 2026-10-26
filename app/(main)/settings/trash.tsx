import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/hooks/useAuth';
import { useTheme, useThemedStyles } from '../../../src/theme/ThemeProvider';
import { IconButton } from '../../../src/components/IconButton';
import type { ThemeColors } from '../../../src/constants/colors';
import { Typography } from '../../../src/constants/typography';
import {
  getTrashItems,
  restoreItem,
  permanentlyDelete,
  emptyTrash,
  trashFolder,
  trashProject,
  trashSession,
  type TrashItem,
} from '../../../src/services/trash.service';
import { showAlert } from '../../../src/components/dialogs/dialogs';
import { errorMessage } from '../../../src/utils/errors';
import { useConnectivity } from '../../../src/lib/connectivity';
import { notifyLibraryUpdated, useLibraryUpdates } from '../../../src/lib/cache';
import { useAppUndo } from '../../../src/hooks/useAppUndo';
import { deletedAgo, trashKindLabel } from '../../../src/utils/trash';
import { TYPE_ICON } from '../../../src/utils/shelf';
import { SettingsPage } from '../../../src/components/settings/SettingsPage';

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/** Undo of a restore: back to the trash, as it was. */
function trashAgain(item: TrashItem): Promise<void> {
  if (item.type === 'project') return trashProject(item.id);
  if (item.type === 'folder') return trashFolder(item.id);
  return trashSession(item.id);
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export default function TrashScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { session: authSession } = useAuth();
  const userId = authSession?.user?.id ?? '';

  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const offline = useConnectivity() === 'offline';
  const showUndo = useAppUndo();

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
  // Something deleted or restored elsewhere (the grid, the sidebar, Undo) shows here too.
  useLibraryUpdates(fetchItems);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchItems();
    setRefreshing(false);
  };

  const handleRestore = async (item: TrashItem) => {
    try {
      await restoreItem(item);
      setItems(prev => prev.filter(i => i.id !== item.id));
      showUndo(item.place ? `Restored '${item.name}' to ${item.place}` : `Restored '${item.name}'`, () => {
        trashAgain(item)
          .then(notifyLibraryUpdated)
          .catch(err => showAlert('Could not undo', errorMessage(err, 'Please try again.')));
      });
    } catch (err) {
      showAlert('Error', errorMessage(err, 'Could not restore item. Please try again.'));
    }
  };

  const handleDelete = (item: TrashItem) => {
    showAlert(
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
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Could not delete item. Please try again.'));
            }
          },
        },
      ]
    );
  };

  const handleEmptyTrash = () => {
    if (items.length === 0) return;
    showAlert(
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
            } catch (err) {
              showAlert('Error', errorMessage(err, 'Could not empty trash. Please try again.'));
            }
          },
        },
      ]
    );
  };

  return (
    <SettingsPage
      title="Recently Deleted"
      back={{ label: 'Your data', href: '/settings/your-data' }}
      scroll={false}
      right={
        <TouchableOpacity
          onPress={handleEmptyTrash}
          disabled={items.length === 0}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
        >
          <Text style={[styles.emptyAllText, items.length === 0 && styles.emptyAllTextDisabled]}>
            Empty
          </Text>
        </TouchableOpacity>
      }
    >

      <Text style={styles.subheader}>
        Items are deleted automatically after 30 days.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.salmon} />
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
              tintColor={c.salmon}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="trash-outline" size={48} color={c.text.onGradient} />
              <Text style={styles.emptyTitle}>{offline ? 'Needs a connection' : 'No deleted items'}</Text>
              <Text style={styles.emptyBody}>
                {offline
                  ? "Recently Deleted can be opened when you're back online."
                  : 'Items you delete will appear here for 30 days before being permanently removed.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`trash-${item.id}`}>
              <View style={styles.rowIcon}>
                <Ionicons name={TYPE_ICON[item.kind]} size={20} color={c.text.secondary} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {trashKindLabel(item.kind)}
                  {item.place ? ` · from ${item.place}` : ''}
                </Text>
                <Text style={styles.rowMeta}>
                  {deletedAgo(item.deletedAt)} · {item.daysRemaining} day{item.daysRemaining !== 1 ? 's' : ''} left
                </Text>
              </View>
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={() => handleRestore(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${item.name}`}
              >
                <Text style={styles.restoreText}>Restore</Text>
              </TouchableOpacity>
              <IconButton icon="trash-outline" label="Delete permanently" onPress={() => handleDelete(item)} size={18} color={c.error} style={styles.deleteButton} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SettingsPage>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyAllText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium as '500',
    color: c.error,
    textAlign: 'right',
  },
  emptyAllTextDisabled: {
    color: c.text.onGradient,
  },

  subheader: {
    fontSize: Typography.size.sm,
    color: c.text.onGradient,
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
    backgroundColor: c.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.medium as '500',
    color: c.text.primary,
    marginBottom: 2,
  },
  rowMeta: {
    fontSize: Typography.size.xs,
    color: c.text.secondary,
  },
  restoreButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: c.accentLight,
  },
  restoreText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold as '600',
    color: c.accent,
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
    color: c.text.onGradientStrong,
  },
  emptyBody: {
    fontSize: Typography.size.base,
    color: c.text.onGradient,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.5,
  },
});
