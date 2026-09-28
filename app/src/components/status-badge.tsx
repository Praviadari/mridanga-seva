import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StudentStatus } from '../types/database';
import { StatusColors } from '../constants/theme';

interface StatusBadgeProps {
  status: StudentStatus;
  size?: 'small' | 'medium';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'small' }) => {
  const config = StatusColors[status] || {
    bg: '#F3F4F6',
    text: '#4B5563',
    label: status,
  };

  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg },
        isSmall ? styles.badgeSmall : styles.badgeMedium,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: config.text }]} />
      <Text
        style={[
          styles.text,
          { color: config.text },
          isSmall ? styles.textSmall : styles.textMedium,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  badgeMedium: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontWeight: '600',
  },
  textSmall: {
    fontSize: 12,
  },
  textMedium: {
    fontSize: 14,
  },
});
