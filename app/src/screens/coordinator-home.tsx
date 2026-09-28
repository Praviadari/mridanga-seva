import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleSwitcherHeader } from '../components/role-switcher-header';
import { AttendanceScreen } from './attendance-screen';
import { StudentsScreen } from './students-screen';
import { FollowUpScreen } from './followup-screen';
import { SyllabusScreen } from './syllabus-screen';
import { AnnouncementsScreen } from './announcements-screen';
import { ReportsScreen } from './reports-screen';
import { StudentPortalScreen } from './student-portal-screen';
import { useAuth } from '../context/auth-context';
import { useLanguage } from '../context/language-context';
import { BrandColors } from '../constants/theme';

export const CoordinatorHome: React.FC = () => {
  const { isStudent } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<
    'attendance' | 'students' | 'followup' | 'syllabus' | 'announcements' | 'reports'
  >('attendance');

  const tabs: {
    id: 'attendance' | 'students' | 'followup' | 'syllabus' | 'announcements' | 'reports';
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { id: 'attendance', label: t('attendance'), icon: 'checkbox-outline' },
    { id: 'students', label: t('students'), icon: 'people-outline' },
    { id: 'followup', label: t('followUp'), icon: 'call-outline' },
    { id: 'syllabus', label: t('syllabus'), icon: 'book-outline' },
    { id: 'announcements', label: t('notices'), icon: 'megaphone-outline' },
    { id: 'reports', label: t('reports'), icon: 'bar-chart-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Top Branding, Language Switcher & View-As Selector */}
      <RoleSwitcherHeader />

      {/* Main Content Area */}
      <View style={styles.body}>
        {isStudent ? (
          <StudentPortalScreen />
        ) : (
          <>
            {activeTab === 'attendance' && <AttendanceScreen />}
            {activeTab === 'students' && <StudentsScreen />}
            {activeTab === 'followup' && <FollowUpScreen />}
            {activeTab === 'syllabus' && <SyllabusScreen />}
            {activeTab === 'announcements' && <AnnouncementsScreen />}
            {activeTab === 'reports' && <ReportsScreen />}
          </>
        )}
      </View>

      {/* Coordinator Bottom Tab Navigation Bar */}
      {!isStudent && (
        <View style={styles.bottomNav}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={styles.navItem}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={19}
                  color={isActive ? BrandColors.primary : '#64748B'}
                />
                <Text style={[styles.navText, isActive && styles.navTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  body: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  navText: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '500',
  },
  navTextActive: {
    color: BrandColors.primary,
    fontWeight: '700',
  },
});
