import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleSwitcherHeader } from '../components/role-switcher-header';
import { AttendanceScreen } from './attendance-screen';
import { StudentsScreen } from './students-screen';
import { FollowUpScreen } from './followup-screen';
import { SyllabusScreen } from './syllabus-screen';
import { AnnouncementsScreen } from './announcements-screen';
import { ReportsScreen } from './reports-screen';
import { GroupsScreen } from './groups-screen';
import { MetronomeScreen } from './metronome-screen';
import { KioskScreen } from './kiosk-screen';
import { StudentPortalScreen } from './student-portal-screen';
import { useAuth } from '../context/auth-context';
import { useLanguage } from '../context/language-context';
import { BrandColors } from '../constants/theme';

export const CoordinatorHome: React.FC = () => {
  const { role, switchDemoRole } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<
    'attendance' | 'students' | 'followup' | 'syllabus' | 'groups' | 'practice' | 'notices' | 'reports'
  >('attendance');

  // If role is Kiosk / Door tablet
  if (role === 'kiosk') {
    return <KioskScreen onExit={() => switchDemoRole('coordinator')} />;
  }

  // If role is Student
  if (role === 'student') {
    return (
      <View style={styles.container}>
        <RoleSwitcherHeader />
        <StudentPortalScreen />
      </View>
    );
  }

  const tabs: {
    id: 'attendance' | 'students' | 'followup' | 'syllabus' | 'groups' | 'practice' | 'notices' | 'reports';
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { id: 'attendance', label: t('attendance'), icon: 'checkbox-outline' },
    { id: 'students', label: t('students'), icon: 'people-outline' },
    { id: 'followup', label: t('followUp'), icon: 'call-outline' },
    { id: 'syllabus', label: t('syllabus'), icon: 'book-outline' },
    { id: 'groups', label: t('groups'), icon: 'albums-outline' },
    { id: 'practice', label: t('practice'), icon: 'musical-notes-outline' },
    { id: 'notices', label: t('notices'), icon: 'megaphone-outline' },
    { id: 'reports', label: t('reports'), icon: 'bar-chart-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Top Branding, Language Switcher & View-As Selector */}
      <RoleSwitcherHeader />

      {/* Main Content Area */}
      <View style={styles.body}>
        {activeTab === 'attendance' && <AttendanceScreen />}
        {activeTab === 'students' && <StudentsScreen />}
        {activeTab === 'followup' && <FollowUpScreen />}
        {activeTab === 'syllabus' && <SyllabusScreen />}
        {activeTab === 'groups' && <GroupsScreen />}
        {activeTab === 'practice' && <MetronomeScreen />}
        {activeTab === 'notices' && <AnnouncementsScreen />}
        {activeTab === 'reports' && <ReportsScreen />}
      </View>

      {/* Coordinator Bottom Tab Navigation Bar with horizontal scrolling for clean fit */}
      <View style={styles.bottomNavContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bottomNav}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={isActive ? BrandColors.primary : '#64748B'}
                />
                <Text style={[styles.navText, isActive && styles.navTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
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
  bottomNavContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  bottomNav: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 4,
  },
  navItem: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 3,
  },
  navItemActive: {
    backgroundColor: BrandColors.primaryLight,
  },
  navText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  navTextActive: {
    color: BrandColors.primaryDark,
    fontWeight: '700',
  },
});
