import React from 'react';
import { ViewStyle } from 'react-native';

import Avatar from './Avatar';
import { useAuth } from '../hooks/useAuth';

interface UserAvatarProps {
  /** Diameter in dp. Default: 40 */
  size?: number;
  style?: ViewStyle;
}

/**
 * The signed-in student's avatar: profile photo, with initials as fallback.
 * Use this wherever "my" avatar appears, so every place shows the same photo.
 */
export default function UserAvatar({ size, style }: UserAvatarProps) {
  const { profile } = useAuth();
  return (
    <Avatar
      size={size}
      style={style}
      initials={profile?.initials ?? '??'}
      photoPath={profile?.avatar_path}
    />
  );
}
