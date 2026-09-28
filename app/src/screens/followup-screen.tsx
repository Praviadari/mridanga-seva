import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { StatusBadge } from '../components/status-badge';
import { BrandColors } from '../constants/theme';
import { CallOutcome, Student } from '../types/database';

export const FollowUpScreen: React.FC = () => {
  const { students, followUpTasks, logCall } = useData();

  // Find students who are irregular, inactive, or have open follow-up tasks
  const irregularStudents = students.filter(
    (s) => s.status === 'irregular' || s.status === 'inactive'
  );

  const [activeCallStudent, setActiveCallStudent] = useState<Student | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome>('returning');
  const [reason, setReason] = useState<string>('Studies/exams');
  const [comment, setComment] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callReasons = [
    'Studies/exams',
    'Work/timing clash',
    'Moved/distance',
    'Health',
    'Family',
    'Lost interest',
    'Joined elsewhere',
    'Travel',
    'Other',
  ];

  const handleOpenCallModal = (student: Student) => {
    setActiveCallStudent(student);
    setOutcome('returning');
    setReason('Studies/exams');
    setComment('');
    // Default next follow-up date: 7 days from now
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setNextDate(d.toISOString().split('T')[0]);
  };

  const handleSubmitCall = async () => {
    if (!activeCallStudent) return;
    if (!comment.trim()) {
      Alert.alert('Required Note', 'Please provide a comment summarizing the phone conversation.');
      return;
    }

    if ((outcome === 'returning' || outcome === 'paused') && !nextDate) {
      Alert.alert('Date Required', 'Please set the expected return or pause-until date.');
      return;
    }

    setIsSubmitting(true);
    const res = await logCall(
      activeCallStudent.id,
      outcome,
      reason,
      comment.trim(),
      nextDate || undefined
    );
    setIsSubmitting(false);

    if (res.success) {
      Alert.alert(
        'Call Logged',
        `Follow-up recorded for ${activeCallStudent.full_name}. Outcome: ${outcome.toUpperCase()}`
      );
      setActiveCallStudent(null);
    } else {
      Alert.alert('Error', res.error || 'Failed to log call.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Overview Banner */}
      <View style={styles.banner}>
        <Ionicons name="call" size={24} color={BrandColors.primary} />
        <View style={styles.bannerTextCol}>
          <Text style={styles.bannerTitle}>Coordinator Follow-Up Desk</Text>
          <Text style={styles.bannerSubtitle}>
            Reach out to students absent for 14+ days. A logged call is the only way a student is marked Paused or Left.
          </Text>
        </View>
      </View>

      {/* Task Summary Count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {irregularStudents.length} Students Requiring Follow-Up
        </Text>
      </View>

      {/* List of Irregular / Inactive Students */}
      <FlatList
        data={irregularStudents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const task = followUpTasks.find((t) => t.student_id === item.id);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.studentName}>{item.full_name}</Text>
                  <Text style={styles.rollNo}>{item.roll_no}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>

              <View style={styles.cardDetails}>
                <Text style={styles.detailText}>
                  📍 Area: {item.area || 'Unknown'} • Level: {item.level_id === 1 ? 'Beginner' : 'Intermediate'}
                </Text>
                {item.phone && (
                  <Text style={styles.phoneText}>📞 {item.phone}</Text>
                )}
                {task && (
                  <View style={styles.taskBadge}>
                    <Ionicons name="time-outline" size={14} color="#B45309" />
                    <Text style={styles.taskText}>
                      Call task due: {task.due_on} {task.attempt > 1 ? `(Attempt ${task.attempt})` : ''}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => handleOpenCallModal(item)}
              >
                <Ionicons name="call-outline" size={16} color="#FFFFFF" />
                <Text style={styles.callBtnText}>Log Call Outcome</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {/* Log Call Modal */}
      {activeCallStudent && (
        <Modal visible={Boolean(activeCallStudent)} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Log Follow-Up Call</Text>
                  <Text style={styles.modalSubtitle}>
                    {activeCallStudent.full_name} ({activeCallStudent.roll_no})
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setActiveCallStudent(null)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} contentContainerStyle={{ gap: 12 }}>
                {/* Outcome Selector */}
                <Text style={styles.label}>Call Outcome:</Text>
                <View style={styles.outcomeGrid}>
                  {[
                    { id: 'returning', label: 'Returning to Class', icon: 'checkmark-circle' },
                    { id: 'paused', label: 'Taking Temporary Pause', icon: 'pause-circle' },
                    { id: 'not_reachable', label: 'Not Reachable (Retry)', icon: 'close-circle' },
                    { id: 'discontinued', label: 'Discontinued (Left)', icon: 'exit' },
                  ].map((o) => {
                    const isSelected = outcome === o.id;
                    return (
                      <TouchableOpacity
                        key={o.id}
                        style={[styles.outcomeBtn, isSelected && styles.outcomeBtnActive]}
                        onPress={() => setOutcome(o.id as CallOutcome)}
                      >
                        <Text style={[styles.outcomeBtnText, isSelected && styles.outcomeBtnTextActive]}>
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Reason Selection */}
                {outcome !== 'not_reachable' && (
                  <>
                    <Text style={styles.label}>Reason Given:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 40 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {callReasons.map((r) => {
                          const isSel = reason === r;
                          return (
                            <TouchableOpacity
                              key={r}
                              style={[styles.reasonChip, isSel && styles.reasonChipActive]}
                              onPress={() => setReason(r)}
                            >
                              <Text style={[styles.reasonChipText, isSel && styles.reasonChipTextActive]}>
                                {r}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                )}

                {/* Expected Return Date or Pause Date */}
                {(outcome === 'returning' || outcome === 'paused') && (
                  <View>
                    <Text style={styles.label}>
                      {outcome === 'paused' ? 'Paused Until (Date):' : 'Expected Return Date:'}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD (e.g. 2026-10-15)"
                      placeholderTextColor="#94A3B8"
                      value={nextDate}
                      onChangeText={setNextDate}
                    />
                  </View>
                )}

                {/* Notes & Comments */}
                <Text style={styles.label}>Conversation Notes (Required):</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  numberOfLines={4}
                  placeholder="Summarize discussion, student situation, when they plan to come back..."
                  placeholderTextColor="#94A3B8"
                  value={comment}
                  onChangeText={setComment}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.submitCallBtn, isSubmitting && { opacity: 0.6 }]}
                  onPress={handleSubmitCall}
                  disabled={isSubmitting}
                >
                  <Text style={styles.submitCallText}>
                    {isSubmitting ? 'Saving...' : 'Save Call & Update Status'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
  },
  banner: {
    flexDirection: 'row',
    backgroundColor: BrandColors.primaryLight,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9A3412',
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#C2410C',
    marginTop: 2,
    lineHeight: 16,
  },
  countRow: {
    marginBottom: 12,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  listContent: {
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  rollNo: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.primary,
    marginTop: 2,
  },
  cardDetails: {
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#64748B',
  },
  phoneText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  taskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  taskText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
  },
  callBtn: {
    backgroundColor: BrandColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4,
  },
  callBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  modalBody: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  outcomeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outcomeBtn: {
    flexBasis: '48%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  outcomeBtnActive: {
    backgroundColor: BrandColors.primary,
    borderColor: BrandColors.primary,
  },
  outcomeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  outcomeBtnTextActive: {
    color: '#FFFFFF',
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reasonChipActive: {
    backgroundColor: BrandColors.secondary,
    borderColor: BrandColors.secondary,
  },
  reasonChipText: {
    fontSize: 12,
    color: '#475569',
  },
  reasonChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  submitCallBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitCallText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
