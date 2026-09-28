import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { useAuth } from '../context/auth-context';
import { StatusBadge } from '../components/status-badge';
import { BrandColors } from '../constants/theme';

export const StudentPortalScreen: React.FC = () => {
  const { students, syllabus, visits } = useData();
  const { profile } = useAuth();

  // Find the student matching profile or pick first student as demo
  const currentStudent =
    students.find((s) => s.email === profile?.email) || students[0];

  const studentVisits = visits.filter(
    (v) => v.student_id === currentStudent?.id
  );

  const levelSyllabus = syllabus.filter(
    (item) => item.level_id === currentStudent?.level_id
  );
  const completedCount = levelSyllabus.filter((item) => item.completed).length;
  const progressPct =
    levelSyllabus.length > 0
      ? Math.round((completedCount / levelSyllabus.length) * 100)
      : 0;

  if (!currentStudent) {
    return (
      <View style={styles.center}>
        <Text>No student record linked yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Student Digital Pass / QR Card */}
      <View style={styles.passCard}>
        <View style={styles.passHeader}>
          <View>
            <Text style={styles.passTitle}>MRIDANGA SEVA</Text>
            <Text style={styles.passSubtitle}>STUDENT DIGITAL PASS</Text>
          </View>
          <StatusBadge status={currentStudent.status} size="medium" />
        </View>

        <View style={styles.qrBox}>
          {/* Simulated QR Pattern */}
          <Ionicons name="qr-code" size={140} color="#0F172A" />
          <Text style={styles.scanInstruction}>Present at door for attendance</Text>
        </View>

        <View style={styles.passDetails}>
          <View>
            <Text style={styles.studentName}>{currentStudent.full_name}</Text>
            <Text style={styles.rollNo}>{currentStudent.roll_no}</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>
              {currentStudent.level_id === 1
                ? 'Level 1: Beginner'
                : currentStudent.level_id === 2
                ? 'Level 2: Intermediate'
                : 'Level 3: Advanced'}
            </Text>
          </View>
        </View>
      </View>

      {/* Syllabus Progress */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="ribbon" size={20} color={BrandColors.primary} />
          <Text style={styles.sectionTitle}>Syllabus Progress</Text>
        </View>

        <View style={styles.progressRow}>
          <Text style={styles.progressPctText}>{progressPct}% Completed</Text>
          <Text style={styles.progressCountText}>
            {completedCount} of {levelSyllabus.length} items
          </Text>
        </View>

        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
        </View>

        <View style={styles.checklist}>
          {levelSyllabus.map((item) => (
            <View key={item.id} style={styles.checkItem}>
              <Ionicons
                name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={item.completed ? '#16A34A' : '#94A3B8'}
              />
              <Text
                style={[
                  styles.checkItemText,
                  item.completed && styles.checkItemCompleted,
                ]}
              >
                {item.title}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Attendance History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="calendar" size={20} color={BrandColors.primary} />
          <Text style={styles.sectionTitle}>Recent Attendance</Text>
        </View>

        {studentVisits.length === 0 ? (
          <Text style={styles.emptyText}>No check-ins recorded yet.</Text>
        ) : (
          <View style={styles.visitList}>
            {studentVisits.slice(0, 5).map((v) => (
              <View key={v.id} style={styles.visitRow}>
                <Ionicons name="checkmark-done" size={16} color="#16A34A" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.visitDate}>
                    {new Date(v.check_in).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.visitTime}>
                    In: {new Date(v.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {v.check_out
                      ? ` • Out: ${new Date(v.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : ' • Still in class'}
                  </Text>
                </View>
                <View style={styles.methodTag}>
                  <Text style={styles.methodTagText}>{v.method.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  passHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  passTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: BrandColors.primaryDark,
    letterSpacing: 1,
  },
  passSubtitle: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginVertical: 6,
  },
  scanInstruction: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '500',
  },
  passDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  studentName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  rollNo: {
    fontSize: 13,
    fontWeight: '700',
    color: BrandColors.primary,
  },
  levelBadge: {
    backgroundColor: BrandColors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: BrandColors.primaryDark,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressPctText: {
    fontSize: 14,
    fontWeight: '700',
    color: BrandColors.primary,
  },
  progressCountText: {
    fontSize: 12,
    color: '#64748B',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: BrandColors.primary,
  },
  checklist: {
    gap: 8,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkItemText: {
    fontSize: 13,
    color: '#334155',
  },
  checkItemCompleted: {
    color: '#15803D',
    fontWeight: '500',
  },
  visitList: {
    gap: 10,
  },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
  },
  visitDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  visitTime: {
    fontSize: 11,
    color: '#64748B',
  },
  methodTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  emptyText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
});
