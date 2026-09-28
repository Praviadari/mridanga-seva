import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoleSwitcherHeader } from '../components/role-switcher-header';
import { AttendanceScreen } from './attendance-screen';
import { StudentsScreen } from './students-screen';
import { FollowUpScreen } from './followup-screen';
import { SyllabusScreen } from './syllabus-screen';
import { AnnouncementsScreen } from './announcements-screen';
import { StudentPortalScreen } from './student-portal-screen';
import { useAuth } from '../context/auth-context';
import { BrandColors } from '../constants/theme';

export const CoordinatorHome: React.FC = () => {
  const { isStudent } = useAuth();
  const [activeTab, setActiveTab] = useState<'attendance' | 'students' | 'followup' | 'syllabus' | 'announcements'>('attendance');

  const tabs: {
    id: 'attendance' | 'students' | 'followup' | 'syllabus' | 'announcements';
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { id: 'attendance', label: 'Attendance', icon: 'checkbox-outline' },
    { id: 'students', label: 'Students', icon: 'people-outline' },
    { id: 'followup', label: 'Follow-Up', icon: 'call-outline' },
    { id: 'syllabus', label: 'Syllabus', icon: 'book-outline' },
    { id: 'announcements', label: 'Notices', icon: 'megaphone-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Top Branding & View-As Selector */}
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
                  size={20}
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
    paddingHorizontal: 4,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  navText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  navTextActive: {
    color: BrandColors.primary,
    fontWeight: '700',
  },
});
