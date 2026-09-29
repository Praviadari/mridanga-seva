import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Student } from '../types/database';
import { StatusBadge } from '../components/status-badge';
import { BrandColors } from '../constants/theme';
import { useData } from '../context/data-context';
import { isMinorStudent } from '../utils/student-rules';

interface StudentDetailModalProps {
  student: Student | null;
  onClose: () => void;
  onOpenCallLog?: (student: Student) => void;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  student,
  onClose,
  onOpenCallLog,
}) => {
  const {
    visits,
    syllabus,
    studentProgress,
    tickStudentSyllabus,
    callLogs,
    promoteStudent,
    toggleVisit,
  } = useData();

  const [activeTab, setActiveTab] = useState<'overview' | 'syllabus' | 'visits' | 'calls'>('overview');

  if (!student) return null;

  const studentVisits = visits.filter((v) => v.student_id === student.id);
  const studentCalls = callLogs.filter((c) => c.student_id === student.id);
  const completedItemIds = studentProgress[student.id] || [];

  const currentLevelSyllabus = syllabus.filter((item) => item.level_id === student.level_id);
  const completedInLevel = currentLevelSyllabus.filter((item) =>
    completedItemIds.includes(item.id)
  ).length;

  const progressPct =
    currentLevelSyllabus.length > 0
      ? Math.round((completedInLevel / currentLevelSyllabus.length) * 100)
      : 0;

  const isMinor = isMinorStudent(student.dob);

  const handlePromote = async () => {
    if (student.level_id >= 3) {
      Alert.alert('Maximum Level', `${student.full_name} is already at Advanced (Level 3).`);
      return;
    }

    const nextLevelId = student.level_id + 1;
    const nextLevelName = nextLevelId === 2 ? 'Intermediate (Level 2)' : 'Advanced (Level 3)';

    Alert.alert(
      'Confirm Promotion',
      `Promote ${student.full_name} to ${nextLevelName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Promote',
          onPress: async () => {
            const res = await promoteStudent(student.id, nextLevelId);
            if (res.success) {
              Alert.alert('Promoted!', `${student.full_name} promoted to ${nextLevelName}.`);
            }
          },
        },
      ]
    );
  };

  const handleToggleAttendance = async () => {
    const res = await toggleVisit(student.id, 'manual');
    Alert.alert(
      'Attendance Updated',
      `${res.action === 'in' ? 'Checked IN' : 'Checked OUT'}: ${student.full_name}`
    );
  };

  return (
    <Modal visible={Boolean(student)} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.studentName}>{student.full_name}</Text>
                <StatusBadge status={student.status} />
              </View>
              <Text style={styles.rollNo}>
                {student.roll_no} • Level {student.level_id} (
                {student.level_id === 1
                  ? 'Beginner'
                  : student.level_id === 2
                  ? 'Intermediate'
                  : 'Advanced'}
                )
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Sub Navigation Tabs */}
          <View style={styles.tabBar}>
            {[
              { id: 'overview', label: 'Profile' },
              { id: 'syllabus', label: `Syllabus (${completedInLevel}/${currentLevelSyllabus.length})` },
              { id: 'visits', label: `Visits (${studentVisits.length})` },
              { id: 'calls', label: `Calls (${studentCalls.length})` },
            ].map((tab) => {
              const isSel = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tab, isSel && styles.tabActive]}
                  onPress={() => setActiveTab(tab.id as any)}
                >
                  <Text style={[styles.tabText, isSel && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <View style={styles.section}>
                <View style={styles.infoGrid}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Status</Text>
                    <StatusBadge status={student.status} size="medium" />
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Joined Date</Text>
                    <Text style={styles.infoVal}>{student.joined_on}</Text>
                  </View>
                  {student.dob && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Date of Birth</Text>
                      <Text style={styles.infoVal}>
                        {student.dob} {isMinor ? '(Minor under 18)' : ''}
                      </Text>
                    </View>
                  )}
                  {student.phone && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Phone</Text>
                      <Text style={styles.infoVal}>{student.phone}</Text>
                    </View>
                  )}
                  {student.email && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Email</Text>
                      <Text style={styles.infoVal}>{student.email}</Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Area / Locality</Text>
                    <Text style={styles.infoVal}>
                      {student.area || 'Abids'} ({student.pincode || '500001'})
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>QR Pass Code</Text>
                    <Text style={[styles.infoVal, { fontSize: 11, color: '#64748B' }]}>
                      {student.qr_token}
                    </Text>
                  </View>
                </View>

                {/* Minor DPDP Parental Consent Notice */}
                {isMinor && (
                  <View style={styles.minorBox}>
                    <Ionicons name="shield-checkmark" size={18} color="#15803D" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.minorTitle}>DPDP Verified Consent</Text>
                      <Text style={styles.minorDesc}>
                        Written parental consent on file (Aadhaar / ID sighted).
                      </Text>
                    </View>
                  </View>
                )}

                {/* Quick Action Buttons */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnAttendance]}
                    onPress={handleToggleAttendance}
                  >
                    <Ionicons name="checkbox-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.btnText}>
                      {student.is_checked_in ? 'Check Out' : 'Check In'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btn, styles.btnPromote]}
                    onPress={handlePromote}
                  >
                    <Ionicons name="arrow-up-circle-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.btnText}>Promote Level</Text>
                  </TouchableOpacity>

                  {onOpenCallLog && (
                    <TouchableOpacity
                      style={[styles.btn, styles.btnCall]}
                      onPress={() => onOpenCallLog(student)}
                    >
                      <Ionicons name="call-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.btnText}>Log Call</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* SYLLABUS TAB */}
            {activeTab === 'syllabus' && (
              <View style={styles.section}>
                {/* Progress bar */}
                <View style={styles.progressHeader}>
                  <Text style={styles.progressPct}>{progressPct}% Mastered</Text>
                  <Text style={styles.progressCount}>
                    {completedInLevel} of {currentLevelSyllabus.length} items
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                </View>

                {/* Checklist */}
                <View style={styles.checklist}>
                  {currentLevelSyllabus.map((item, idx) => {
                    const isDone = completedItemIds.includes(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.checkRow, isDone && styles.checkRowDone]}
                        onPress={() => tickStudentSyllabus(student.id, item.id, !isDone)}
                      >
                        <Ionicons
                          name={isDone ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={isDone ? BrandColors.primary : '#94A3B8'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.checkTitle, isDone && styles.checkTitleDone]}>
                            {idx + 1}. {item.title}
                          </Text>
                          {item.description ? (
                            <Text style={styles.checkDesc}>{item.description}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* VISITS TAB */}
            {activeTab === 'visits' && (
              <View style={styles.section}>
                {studentVisits.length === 0 ? (
                  <Text style={styles.emptyText}>No visits recorded yet for this student.</Text>
                ) : (
                  <View style={styles.visitList}>
                    {studentVisits.map((v) => (
                      <View key={v.id} style={styles.visitCard}>
                        <View style={styles.visitHeader}>
                          <Text style={styles.visitDate}>
                            {new Date(v.check_in).toLocaleDateString(undefined, {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                          <View style={styles.methodTag}>
                            <Text style={styles.methodText}>{v.method.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={styles.visitTimes}>
                          Check-in: {new Date(v.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {v.check_out
                            ? ` • Check-out: ${new Date(v.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : ' • Currently in class'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* CALLS TAB */}
            {activeTab === 'calls' && (
              <View style={styles.section}>
                {studentCalls.length === 0 ? (
                  <Text style={styles.emptyText}>No follow-up calls logged for this student.</Text>
                ) : (
                  <View style={styles.callList}>
                    {studentCalls.map((c) => (
                      <View key={c.id} style={styles.callCard}>
                        <View style={styles.callTop}>
                          <Text style={styles.callOutcome}>Outcome: {c.outcome.toUpperCase()}</Text>
                          <Text style={styles.callDate}>
                            {new Date(c.called_at).toLocaleDateString()}
                          </Text>
                        </View>
                        {c.reason && (
                          <Text style={styles.callReason}>Reason: {c.reason}</Text>
                        )}
                        <Text style={styles.callComment}>{`"${c.comment}"`}</Text>
                        {c.next_date && (
                          <Text style={styles.callNext}>Expected / Next: {c.next_date}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  rollNo: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.primary,
  },
  closeBtn: {
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: BrandColors.primary,
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  tabTextActive: {
    color: BrandColors.primaryDark,
    fontWeight: '700',
  },
  body: {
    padding: 16,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  section: {
    gap: 14,
  },
  infoGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  minorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#DCFCE7',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  minorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  minorDesc: {
    fontSize: 11,
    color: '#166534',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 8,
  },
  btnAttendance: {
    backgroundColor: BrandColors.primary,
  },
  btnPromote: {
    backgroundColor: '#1E293B',
  },
  btnCall: {
    backgroundColor: '#D97706',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressPct: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.primary,
  },
  progressCount: {
    fontSize: 12,
    color: '#64748B',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: BrandColors.primary,
  },
  checklist: {
    gap: 8,
    marginTop: 6,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  checkRowDone: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  checkTitleDone: {
    color: '#15803D',
  },
  checkDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  visitList: {
    gap: 8,
  },
  visitCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  visitDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  methodTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  visitTimes: {
    fontSize: 12,
    color: '#64748B',
  },
  callList: {
    gap: 10,
  },
  callCard: {
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  callTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  callOutcome: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
  },
  callDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  callReason: {
    fontSize: 12,
    color: '#475569',
  },
  callComment: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#1E293B',
  },
  callNext: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
