import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { BrandColors } from '../constants/theme';

interface RegisterModalProps {
  visible: boolean;
  onClose: () => void;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({ visible, onClose }) => {
  const { registerStudent } = useData();

  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');
  const [pincode, setPincode] = useState('');
  const [levelId, setLevelId] = useState<number>(1);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('Parent');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if minor (< 18 years old)
  const isMinor = Boolean(dob && new Date(dob).getFullYear() > new Date().getFullYear() - 18);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Missing Field', 'Please enter student full name');
      return;
    }

    if (pincode && !/^[0-9]{6}$/.test(pincode)) {
      Alert.alert('Invalid Pincode', 'Pincode must be exactly 6 digits');
      return;
    }

    if (isMinor && (!guardianName.trim() || !consentConfirmed)) {
      Alert.alert(
        'Parental Consent Required',
        'For minors under 18, guardian details and written parental consent must be recorded.'
      );
      return;
    }

    setIsSubmitting(true);
    const res = await registerStudent({
      full_name: fullName.trim(),
      dob: dob || undefined,
      phone: phone || undefined,
      email: email || undefined,
      area: area || undefined,
      pincode: pincode || undefined,
      level_id: levelId,
      guardian_name: isMinor ? guardianName : undefined,
      guardian_relation: isMinor ? guardianRelation : undefined,
    });

    setIsSubmitting(false);

    if (res.success && res.student) {
      Alert.alert(
        'Student Registered!',
        `Successfully registered ${res.student.full_name} with Roll Number: ${res.student.roll_no}. Status set to 'New'.`
      );
      // Reset form
      setFullName('');
      setDob('');
      setPhone('');
      setEmail('');
      setArea('');
      setPincode('');
      setLevelId(1);
      setGuardianName('');
      setConsentConfirmed(false);
      onClose();
    } else {
      Alert.alert('Registration Failed', res.error || 'Could not register student.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Register New Student</Text>
              <Text style={styles.subtitle}>Enrolls student into Abids centre</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
            {/* Full Name */}
            <Text style={styles.label}>
              Full Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Radhika Sharma"
              placeholderTextColor="#94A3B8"
              value={fullName}
              onChangeText={setFullName}
            />

            {/* Date of Birth */}
            <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2005-04-15"
              placeholderTextColor="#94A3B8"
              value={dob}
              onChangeText={setDob}
            />

            {/* Minor Notice & Guardian Details */}
            {isMinor && (
              <View style={styles.minorCard}>
                <View style={styles.minorHeader}>
                  <Ionicons name="shield-checkmark" size={18} color="#B45309" />
                  <Text style={styles.minorTitle}>Minor Protection (Under 18)</Text>
                </View>
                <Text style={styles.minorNotice}>
                  DPDP compliance: Guardian details & verified written consent are mandatory.
                </Text>

                <Text style={styles.label}>
                  Guardian Full Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Suresh Sharma (Father)"
                  placeholderTextColor="#94A3B8"
                  value={guardianName}
                  onChangeText={setGuardianName}
                />

                <Text style={styles.label}>Relationship</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Parent / Legal Guardian"
                  placeholderTextColor="#94A3B8"
                  value={guardianRelation}
                  onChangeText={setGuardianRelation}
                />

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setConsentConfirmed(!consentConfirmed)}
                >
                  <Ionicons
                    name={consentConfirmed ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={BrandColors.primary}
                  />
                  <Text style={styles.checkboxLabel}>
                    Parent/guardian signed written consent form (ID sighted)
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Phone & Email */}
            <Text style={styles.label}>Mobile Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="+91 98765 43210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="student@example.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />

            {/* Area & Pincode */}
            <View style={styles.row}>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>Area / Locality</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Abids, Koti"
                  placeholderTextColor="#94A3B8"
                  value={area}
                  onChangeText={setArea}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.label}>Pincode</Text>
                <TextInput
                  style={styles.input}
                  placeholder="500001"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={6}
                  value={pincode}
                  onChangeText={setPincode}
                />
              </View>
            </View>

            {/* Initial Level */}
            <Text style={styles.label}>Class Level</Text>
            <View style={styles.levelRow}>
              {[
                { id: 1, label: 'Beginner' },
                { id: 2, label: 'Intermediate' },
                { id: 3, label: 'Advanced' },
              ].map((lvl) => {
                const isSelected = levelId === lvl.id;
                return (
                  <TouchableOpacity
                    key={lvl.id}
                    style={[styles.levelBtn, isSelected && styles.levelBtnActive]}
                    onPress={() => setLevelId(lvl.id)}
                  >
                    <Text style={[styles.levelBtnText, isSelected && styles.levelBtnTextActive]}>
                      {lvl.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notice about Roll No */}
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle-outline" size={18} color="#0369A1" />
              <Text style={styles.noticeText}>
                A unique permanent roll number (`MS-2026-XXXX`) and QR token will be generated automatically.
              </Text>
            </View>
          </ScrollView>

          {/* Submit Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Registering...' : 'Register Student'}
              </Text>
            </TouchableOpacity>
          </View>
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
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  closeBtn: {
    padding: 4,
  },
  form: {
    paddingHorizontal: 18,
  },
  formContent: {
    paddingVertical: 14,
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 4,
  },
  required: {
    color: '#DC2626',
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
  row: {
    flexDirection: 'row',
  },
  minorCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    gap: 6,
  },
  minorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  minorTitle: {
    fontWeight: '700',
    color: '#B45309',
    fontSize: 13,
  },
  minorNotice: {
    fontSize: 11,
    color: '#92400E',
    marginBottom: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#451A03',
    flex: 1,
  },
  levelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  levelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  levelBtnActive: {
    backgroundColor: BrandColors.primary,
    borderColor: BrandColors.primary,
  },
  levelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  levelBtnTextActive: {
    color: '#FFFFFF',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginTop: 8,
  },
  noticeText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
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
