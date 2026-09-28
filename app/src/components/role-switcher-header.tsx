import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth-context';
import { BrandColors } from '../constants/theme';
import { AppRole } from '../types/database';

export const RoleSwitcherHeader: React.FC = () => {
  const { role, profile, switchDemoRole } = useAuth();

  const roles: { id: AppRole; label: string }[] = [
    { id: 'coordinator', label: 'Coordinator' },
    { id: 'guru', label: 'Guru' },
    { id: 'student', label: 'Student' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.branding}>
          <Ionicons name="musical-notes" size={22} color={BrandColors.primary} />
          <View>
            <Text style={styles.title}>Mridanga Seva</Text>
            <Text style={styles.subtitle}>Abids Centre • {profile?.full_name || 'Class'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.roleBar}>
        <Text style={styles.roleLabel}>VIEW AS:</Text>
        <View style={styles.pills}>
          {roles.map((r) => {
            const isActive = role === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                onPress={() => switchDemoRole(r.id)}
                style={[styles.pill, isActive && styles.pillActive]}
              >
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  roleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  pillActive: {
    backgroundColor: BrandColors.primary,
  },
  pillText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
