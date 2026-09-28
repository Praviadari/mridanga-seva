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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandColors } from '../constants/theme';
import { useAuth } from '../context/auth-context';

interface ClassGroup {
  id: number;
  name: string;
  purpose: string;
  memberCount: number;
  active: boolean;
}

const INITIAL_GROUPS: ClassGroup[] = [
  {
    id: 1,
    name: 'Sunday Harinam Team',
    purpose: 'Street kirtan team performing at public parks and temples every Sunday.',
    memberCount: 8,
    active: true,
  },
  {
    id: 2,
    name: 'Festival Kirtan Team',
    purpose: 'Lead and accompanist mridanga players for Janmashtami, Gaura Purnima and Ratha Yatra.',
    memberCount: 6,
    active: true,
  },
  {
    id: 3,
    name: 'Beginners Mentoring Circle',
    purpose: 'New joiners in their first four weeks for extra hand practice and encouragement.',
    memberCount: 12,
    active: true,
  },
];

export const GroupsScreen: React.FC = () => {
  const { isStaff } = useAuth();
  const [groups, setGroups] = useState<ClassGroup[]>(INITIAL_GROUPS);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');

  const handleCreateGroup = () => {
    if (!name.trim()) {
      Alert.alert('Missing Field', 'Please enter a group name.');
      return;
    }

    const newGroup: ClassGroup = {
      id: Date.now(),
      name: name.trim(),
      purpose: purpose.trim() || 'General class coordination group',
      memberCount: 1,
      active: true,
    };

    setGroups([...groups, newGroup]);
    setName('');
    setPurpose('');
    setModalVisible(false);
    Alert.alert('Group Created', `Group "${newGroup.name}" created successfully.`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Class Groups & Teams</Text>
          <Text style={styles.subtitle}>
            In-app coordination groups replacing WhatsApp broadcast groups
          </Text>
        </View>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Ionicons name="people" size={20} color={BrandColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.memberCount}>{item.memberCount} members</Text>
              </View>
              <View style={styles.activeTag}>
                <Text style={styles.activeText}>Active</Text>
              </View>
            </View>

            <Text style={styles.purpose}>{item.purpose}</Text>

            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => Alert.alert(item.name, item.purpose)}
              >
                <Ionicons name="eye-outline" size={14} color={BrandColors.primary} />
                <Text style={styles.actionBtnText}>View Members</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {isStaff && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.fabText}>New Group</Text>
        </TouchableOpacity>
      )}

      {/* Create Group Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Group</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Group Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Wednesday Bhajan Troupe"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Purpose & Scope</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                multiline
                placeholder="Describe team goals and session timings..."
                placeholderTextColor="#94A3B8"
                value={purpose}
                onChangeText={setPurpose}
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateGroup}>
                <Text style={styles.submitBtnText}>Create Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
  },
  header: {
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  list: {
    gap: 12,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BrandColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  memberCount: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  activeTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  purpose: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  footerRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.primary,
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
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
  modalBody: {
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
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
  modalFooter: {
    paddingHorizontal: 16,
  },
  submitBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
