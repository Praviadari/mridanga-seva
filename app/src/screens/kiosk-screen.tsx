import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { BrandColors } from '../constants/theme';
import { ToggleVisitResponse } from '../types/database';

export const KioskScreen: React.FC<{ onExit?: () => void }> = ({ onExit }) => {
  const { scanQr, students, toggleVisit } = useData();

  const [inputToken, setInputToken] = useState('');
  const [lastCheckIn, setLastCheckIn] = useState<ToggleVisitResponse | null>(null);
  const [timeStr, setTimeStr] = useState('');

  // Live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (code: string) => {
    if (!code.trim()) return;
    const res = await scanQr(code.trim());
    if (res.action !== 'unknown') {
      setLastCheckIn(res);
      setInputToken('');
      setTimeout(() => setLastCheckIn(null), 5000);
    } else {
      Alert.alert('Scan Failed', 'Unrecognized student QR code or roll number.');
    }
  };

  const handleQuickTap = async (studentId: string) => {
    const res = await toggleVisit(studentId, 'qr');
    setLastCheckIn(res);
    setTimeout(() => setLastCheckIn(null), 5000);
  };

  return (
    <View style={styles.container}>
      {/* Top Bar with exit button */}
      <View style={styles.topBar}>
        <View style={styles.branding}>
          <Ionicons name="musical-notes" size={24} color={BrandColors.primary} />
          <Text style={styles.kioskTitle}>MRIDANGA SEVA • DOOR TABLET</Text>
        </View>

        <View style={styles.rightHeader}>
          <Text style={styles.clockText}>{timeStr}</Text>
          {onExit && (
            <TouchableOpacity style={styles.exitBtn} onPress={onExit}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Kiosk Area */}
      <View style={styles.content}>
        {lastCheckIn ? (
          /* Success Check-in Feedback Screen */
          <View style={styles.successCard}>
            <Ionicons
              name={lastCheckIn.action === 'in' ? 'checkmark-circle' : 'log-out'}
              size={72}
              color={lastCheckIn.action === 'in' ? '#16A34A' : '#D97706'}
            />
            <Text style={styles.greetingText}>
              {lastCheckIn.action === 'in' ? 'Hare Krishna! Welcome!' : 'Checked Out!'}
            </Text>
            <Text style={styles.studentNameText}>{lastCheckIn.full_name}</Text>
            <Text style={styles.rollNoText}>{lastCheckIn.roll_no}</Text>
            <Text style={styles.timeTag}>
              {lastCheckIn.action === 'in'
                ? `Checked in at ${new Date(lastCheckIn.at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : `Class time: ${lastCheckIn.minutes || 0} minutes`}
            </Text>
          </View>
        ) : (
          /* Ready to Scan View */
          <View style={styles.readyCard}>
            <View style={styles.scannerGraphic}>
              <Ionicons name="qr-code-outline" size={100} color={BrandColors.primary} />
              <View style={styles.scanLine} />
            </View>

            <Text style={styles.readyTitle}>Hold your student QR code in front of the camera</Text>
            <Text style={styles.readySubtitle}>
              or enter your Roll Number below:
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.rollInput}
                placeholder="MS-2026-0001"
                placeholderTextColor="#94A3B8"
                autoCapitalize="characters"
                value={inputToken}
                onChangeText={setInputToken}
                onSubmitEditing={() => handleScan(inputToken)}
              />
              <TouchableOpacity
                style={styles.goBtn}
                onPress={() => handleScan(inputToken)}
              >
                <Text style={styles.goBtnText}>Check In</Text>
              </TouchableOpacity>
            </View>

            {/* Quick-tap roster for students who forgot phone */}
            <View style={styles.quickTapSection}>
              <Text style={styles.quickTapTitle}>FORGOT PHONE? TAP YOUR NAME:</Text>
              <View style={styles.rosterGrid}>
                {students.slice(0, 6).map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.rosterBtn}
                    onPress={() => handleQuickTap(s.id)}
                  >
                    <Text style={styles.rosterName}>{s.full_name}</Text>
                    <Text style={styles.rosterRoll}>{s.roll_no}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kioskTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 1,
  },
  rightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  clockText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    fontVariant: ['tabular-nums'],
  },
  exitBtn: {
    padding: 4,
    backgroundColor: '#334155',
    borderRadius: 6,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  readyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  scannerGraphic: {
    position: 'relative',
    padding: 20,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    height: 2,
    width: '80%',
    backgroundColor: BrandColors.primary,
    top: '50%',
  },
  readyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
  },
  readySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  rollInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#F8FAFC',
  },
  goBtn: {
    backgroundColor: BrandColors.primary,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 10,
  },
  goBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  quickTapSection: {
    marginTop: 20,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 16,
  },
  quickTapTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  rosterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  rosterBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  rosterName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  rosterRoll: {
    fontSize: 10,
    color: BrandColors.primary,
  },
  successCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 36,
    width: '100%',
    maxWidth: 450,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#16A34A',
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 16,
  },
  studentNameText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginTop: 4,
  },
  rollNoText: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.primary,
    marginTop: 4,
  },
  timeTag: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 14,
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
});
