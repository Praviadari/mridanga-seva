import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { StatusBadge } from '../components/status-badge';
import { BrandColors } from '../constants/theme';
import { Student } from '../types/database';

export const AttendanceScreen: React.FC = () => {
  const { students, toggleVisit, scanQr, visits } = useData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'checked_in' | 'not_in'>('all');
  const [feedback, setFeedback] = useState<string | null>(null);

  const checkedInCount = students.filter((s) => s.is_checked_in).length;

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.roll_no.toLowerCase().includes(search.toLowerCase()) ||
      (s.area && s.area.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (filter === 'checked_in') return s.is_checked_in;
    if (filter === 'not_in') return !s.is_checked_in;
    return true;
  });

  const handleToggle = async (student: Student) => {
    const res = await toggleVisit(student.id, 'manual');
    if (res.action === 'in') {
      setFeedback(`Checked IN: ${student.full_name} (${student.roll_no})`);
    } else if (res.action === 'out') {
      setFeedback(`Checked OUT: ${student.full_name} (${student.roll_no})`);
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleSimulateScan = () => {
    if (Alert.prompt) {
      Alert.prompt('Simulate QR Scan', 'Enter QR token or Roll No:', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Scan',
          onPress: async (val?: string) => {
            if (!val) return;
            const res = await scanQr(val);
            if (res.action !== 'unknown') {
              setFeedback(`QR ${res.action.toUpperCase()}: ${res.full_name} (${res.roll_no})`);
              setTimeout(() => setFeedback(null), 4000);
            } else {
              Alert.alert('Scan Failed', 'Unrecognized QR token');
            }
          },
        },
      ]);
    } else {
      handlePromptFallback();
    }
  };

  const handlePromptFallback = async () => {
    // If on platform without Alert.prompt, pick first student
    if (students.length > 0) {
      const target = students[0];
      const res = await scanQr(target.qr_token);
      setFeedback(`Simulated QR ${res.action.toUpperCase()}: ${res.full_name}`);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  return (
    <View style={styles.container}>
      {/* Metric Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{checkedInCount}</Text>
          <Text style={styles.statLabel}>Here Now</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{students.length}</Text>
          <Text style={styles.statLabel}>Enrolled</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{visits.length}</Text>
          <Text style={styles.statLabel}>{"Today's Visits"}</Text>
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={handleSimulateScan}>
          <Ionicons name="qr-code-outline" size={24} color="#FFFFFF" />
          <Text style={styles.scanBtnText}>QR Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Feedback banner */}
      {feedback && (
        <View style={styles.feedbackBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#15803D" />
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>
      )}

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search student by name, roll no (MS-2026-...) or area"
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>
            All ({students.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'checked_in' && styles.filterChipActive]}
          onPress={() => setFilter('checked_in')}
        >
          <Text
            style={[styles.filterChipText, filter === 'checked_in' && styles.filterChipTextActive]}
          >
            Here Now ({checkedInCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'not_in' && styles.filterChipActive]}
          onPress={() => setFilter('not_in')}
        >
          <Text style={[styles.filterChipText, filter === 'not_in' && styles.filterChipTextActive]}>
            Not In ({students.length - checkedInCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Students List for Attendance */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const isHere = Boolean(item.is_checked_in);
          return (
            <View style={[styles.studentRow, isHere && styles.studentRowCheckedIn]}>
              <View style={styles.infoCol}>
                <View style={styles.nameRow}>
                  <Text style={styles.studentName}>{item.full_name}</Text>
                  <StatusBadge status={item.status} />
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.rollNo}>{item.roll_no}</Text>
                  <Text style={styles.metaSep}>•</Text>
                  <Text style={styles.levelText}>
                    {item.level_id === 1 ? 'Beginner' : item.level_id === 2 ? 'Intermediate' : 'Advanced'}
                  </Text>
                  {item.area ? (
                    <>
                      <Text style={styles.metaSep}>•</Text>
                      <Text style={styles.areaText}>{item.area}</Text>
                    </>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.actionBtn, isHere ? styles.btnCheckOut : styles.btnCheckIn]}
                onPress={() => handleToggle(item)}
              >
                <Ionicons
                  name={isHere ? 'log-out-outline' : 'log-in-outline'}
                  size={16}
                  color={isHere ? '#B91C1C' : '#FFFFFF'}
                />
                <Text style={[styles.actionBtnText, isHere ? styles.btnCheckOutText : styles.btnCheckInText]}>
                  {isHere ? 'Check Out' : 'Check In'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  scanBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  feedbackText: {
    color: '#15803D',
    fontWeight: '600',
    fontSize: 13,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: BrandColors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  studentRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentRowCheckedIn: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  infoCol: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rollNo: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.primary,
  },
  metaSep: {
    fontSize: 10,
    color: '#94A3B8',
  },
  levelText: {
    fontSize: 12,
    color: '#64748B',
  },
  areaText: {
    fontSize: 12,
    color: '#64748B',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnCheckIn: {
    backgroundColor: BrandColors.primary,
  },
  btnCheckInText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  btnCheckOut: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  btnCheckOutText: {
    color: '#B91C1C',
    fontWeight: '600',
    fontSize: 13,
  },
  actionBtnText: {
    fontWeight: '600',
  },
});
