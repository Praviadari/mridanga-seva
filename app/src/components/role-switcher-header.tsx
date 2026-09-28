import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/auth-context';
import { useLanguage } from '../context/language-context';
import { BrandColors } from '../constants/theme';
import { AppRole } from '../types/database';
import { Language } from '../i18n/translations';

export const RoleSwitcherHeader: React.FC = () => {
  const { role, profile, switchDemoRole } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  const roles: { id: AppRole; label: string }[] = [
    { id: 'coordinator', label: 'Coordinator' },
    { id: 'guru', label: 'Guru' },
    { id: 'student', label: 'Student' },
  ];

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: 'EN' },
    { code: 'te', label: 'తెలుగు' },
    { code: 'hi', label: 'हिंदी' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.branding}>
          <Ionicons name="musical-notes" size={22} color={BrandColors.primary} />
          <View>
            <Text style={styles.title}>{t('appName')}</Text>
            <Text style={styles.subtitle}>{t('centre')} • {profile?.full_name || 'Class'}</Text>
          </View>
        </View>

        {/* Language selector chips */}
        <View style={styles.langRow}>
          {languages.map((lang) => {
            const isSel = language === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langChip, isSel && styles.langChipActive]}
                onPress={() => setLanguage(lang.code)}
              >
                <Text style={[styles.langText, isSel && styles.langTextActive]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.roleBar}>
        <Text style={styles.roleLabel}>{t('viewAs')}</Text>
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
  langRow: {
    flexDirection: 'row',
    gap: 4,
  },
  langChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langChipActive: {
    backgroundColor: BrandColors.primaryLight,
    borderColor: BrandColors.primary,
  },
  langText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  langTextActive: {
    color: BrandColors.primaryDark,
    fontWeight: '700',
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
