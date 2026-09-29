import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { StatusBadge } from '../components/status-badge';
import { BrandColors } from '../constants/theme';
import { Student } from '../types/database';
import { RegisterModal } from './register-modal';
import { StudentDetailModal } from './student-detail-modal';

export const StudentsScreen: React.FC = () => {
  const { students } = useData();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<number | 'all'>('all');
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const statuses: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'new', label: 'New' },
    { id: 'irregular', label: 'Irregular' },
    { id: 'inactive', label: 'Inactive' },
    { id: 'paused', label: 'Paused' },
    { id: 'left', label: 'Left' },
  ];

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.roll_no.toLowerCase().includes(search.toLowerCase()) ||
      (s.area && s.area.toLowerCase().includes(search.toLowerCase())) ||
      (s.phone && s.phone.includes(search));

    if (!matchesSearch) return false;
    if (selectedStatus !== 'all' && s.status !== selectedStatus) return false;
    if (selectedLevel !== 'all' && s.level_id !== selectedLevel) return false;

    return true;
  });

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, roll no, area or phone"
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

      {/* Status Filter Chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={statuses}
        keyExtractor={(item) => item.id}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContainer}
        renderItem={({ item }) => {
          const isActive = selectedStatus === item.id;
          return (
            <TouchableOpacity
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => setSelectedStatus(item.id)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Level Filters */}
      <View style={styles.levelFilterRow}>
        {[
          { id: 'all', label: 'All Levels' },
          { id: 1, label: 'L1: Beginner' },
          { id: 2, label: 'L2: Inter' },
          { id: 3, label: 'L3: Adv' },
        ].map((lvl) => {
          const isSelected = selectedLevel === lvl.id;
          return (
            <TouchableOpacity
              key={String(lvl.id)}
              style={[styles.levelChip, isSelected && styles.levelChipActive]}
              onPress={() => setSelectedLevel(lvl.id as any)}
            >
              <Text style={[styles.levelChipText, isSelected && styles.levelChipTextActive]}>
                {lvl.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Students Count Header */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          Showing {filteredStudents.length} of {students.length} students
        </Text>
      </View>

      {/* Students List */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => setActiveStudent(item)}
          >
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.studentName}>{item.full_name}</Text>
                <Text style={styles.rollNo}>{item.roll_no}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>

            <View style={styles.cardBody}>
              <View style={styles.badgeRow}>
                <View style={styles.levelTag}>
                  <Text style={styles.levelTagText}>
                    {item.level_id === 1 ? 'Beginner' : item.level_id === 2 ? 'Intermediate' : 'Advanced'}
                  </Text>
                </View>
                {item.area ? (
                  <View style={styles.areaTag}>
                    <Ionicons name="location-outline" size={12} color="#475569" />
                    <Text style={styles.areaTagText}>{item.area}</Text>
                  </View>
                ) : null}
              </View>

              {item.phone ? (
                <Text style={styles.phoneText}>📞 {item.phone}</Text>
              ) : null}

              {item.status === 'paused' && item.paused_until ? (
                <Text style={styles.pausedNotice}>Paused until {item.paused_until}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Floating Register Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowRegisterModal(true)}
      >
        <Ionicons name="person-add" size={20} color="#FFFFFF" />
        <Text style={styles.fabText}>Register</Text>
      </TouchableOpacity>

      {/* Register Modal */}
      <RegisterModal
        visible={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
      />

      {/* Student Details Modal */}
      <StudentDetailModal
        student={activeStudent}
        onClose={() => setActiveStudent(null)}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  chipScroll: {
    maxHeight: 40,
    marginBottom: 8,
  },
  chipContainer: {
    gap: 6,
    paddingRight: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    height: 32,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: BrandColors.primary,
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  levelFilterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  levelChipActive: {
    backgroundColor: BrandColors.secondary,
    borderColor: BrandColors.secondary,
  },
  levelChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  levelChipTextActive: {
    color: '#FFFFFF',
  },
  countRow: {
    marginBottom: 10,
  },
  countText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 80,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
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
  cardBody: {
    gap: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  levelTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  levelTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  areaTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  areaTagText: {
    fontSize: 11,
    color: '#64748B',
  },
  phoneText: {
    fontSize: 12,
    color: '#64748B',
  },
  pausedNotice: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: BrandColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalRollNo: {
    fontSize: 13,
    fontWeight: '600',
    color: BrandColors.primary,
  },
  detailList: {
    gap: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  modalDoneBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
