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
import { useData } from '../context/data-context';
import { BrandColors } from '../constants/theme';
import { useAuth } from '../context/auth-context';

export const AnnouncementsScreen: React.FC = () => {
  const { announcements } = useData();
  const { isStaff } = useAuth();

  const [items, setItems] = useState(announcements);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const handlePost = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing Field', 'Please enter both title and announcement details.');
      return;
    }

    const newPost = {
      id: Date.now(),
      title: title.trim(),
      body: body.trim(),
      attachments: [],
      audience: 'all' as const,
      pinned: isPinned,
      publish_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    setItems([newPost, ...items]);
    setTitle('');
    setBody('');
    setIsPinned(false);
    setModalVisible(false);
    Alert.alert('Posted', 'Announcement published to class.');
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.card, item.pinned && styles.cardPinned]}>
            {item.pinned && (
              <View style={styles.pinnedBadge}>
                <Ionicons name="pin" size={12} color="#D97706" />
                <Text style={styles.pinnedText}>PINNED NOTICE</Text>
              </View>
            )}

            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>

            <View style={styles.footerRow}>
              <Text style={styles.audienceTag}>
                Audience: {item.audience === 'all' ? 'All Students & Staff' : `Level ${item.audience_level || 1}`}
              </Text>
              <Text style={styles.dateText}>
                {new Date(item.publish_at).toLocaleDateString()}
              </Text>
            </View>
          </View>
        )}
      />

      {isStaff && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="megaphone" size={20} color="#FFFFFF" />
          <Text style={styles.fabText}>New Notice</Text>
        </TouchableOpacity>
      )}

      {/* Post Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Announcement</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Schedule Change for Festival"
                placeholderTextColor="#94A3B8"
                value={title}
                onChangeText={setTitle}
              />

              <Text style={styles.label}>Notice Details</Text>
              <TextInput
                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                multiline
                placeholder="Enter details for students..."
                placeholderTextColor="#94A3B8"
                value={body}
                onChangeText={setBody}
              />

              <TouchableOpacity
                style={styles.pinToggle}
                onPress={() => setIsPinned(!isPinned)}
              >
                <Ionicons
                  name={isPinned ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={BrandColors.primary}
                />
                <Text style={styles.pinToggleText}>Pin to top of feed</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.postBtn} onPress={handlePost}>
                <Text style={styles.postBtnText}>Publish Announcement</Text>
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
    gap: 8,
  },
  cardPinned: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFDF5',
  },
  pinnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinnedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  body: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  audienceTag: {
    fontSize: 11,
    color: BrandColors.primary,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
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
  pinToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  pinToggleText: {
    fontSize: 13,
    color: '#475569',
  },
  modalFooter: {
    paddingHorizontal: 16,
  },
  postBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  postBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
