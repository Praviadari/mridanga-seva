import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { useAuth } from '../context/auth-context';
import { BrandColors, StatusColors } from '../constants/theme';
import { Material } from '../types/database';

export const ReportsScreen: React.FC = () => {
  const { students, materials } = useData();
  const { isGuru } = useAuth();

  const total = students.length;
  const activeCount = students.filter((s) => s.status === 'active').length;
  const irregularCount = students.filter((s) => s.status === 'irregular').length;
  const inactiveCount = students.filter((s) => s.status === 'inactive').length;
  const pausedCount = students.filter((s) => s.status === 'paused').length;
  const leftCount = students.filter((s) => s.status === 'left').length;

  const retentionPct = total > 0 ? Math.round((activeCount / total) * 100) : 0;

  // Level breakdowns
  const l1Count = students.filter((s) => s.level_id === 1).length;
  const l2Count = students.filter((s) => s.level_id === 2).length;
  const l3Count = students.filter((s) => s.level_id === 3).length;

  // Unapproved materials awaiting Guru approval
  const pendingMaterials = materials.filter((m) => !m.approved_by);

  const handleApproveMaterial = (mat: Material) => {
    Alert.alert('Approved', `Material "${mat.title}" is now approved for Level ${mat.level_id}.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title & Badge */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Class Health & Analytics</Text>
          <Text style={styles.subtitle}>
            Abids Drop-In Centre • {isGuru ? 'Guru / Admin Mode' : 'Coordinator View'}
          </Text>
        </View>
        <View style={styles.retentionBadge}>
          <Text style={styles.retentionNum}>{retentionPct}%</Text>
          <Text style={styles.retentionLabel}>Active Retention</Text>
        </View>
      </View>

      {/* Primary KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { borderColor: StatusColors.active.text }]}>
          <Text style={[styles.kpiValue, { color: StatusColors.active.text }]}>
            {activeCount}
          </Text>
          <Text style={styles.kpiTitle}>Active Students</Text>
          <Text style={styles.kpiSub}>Attended &lt; 14 days</Text>
        </View>

        <View style={[styles.kpiCard, { borderColor: StatusColors.irregular.text }]}>
          <Text style={[styles.kpiValue, { color: StatusColors.irregular.text }]}>
            {irregularCount}
          </Text>
          <Text style={styles.kpiTitle}>Irregular (Action)</Text>
          <Text style={styles.kpiSub}>14 - 30 days quiet</Text>
        </View>

        <View style={[styles.kpiCard, { borderColor: StatusColors.inactive.text }]}>
          <Text style={[styles.kpiValue, { color: StatusColors.inactive.text }]}>
            {inactiveCount}
          </Text>
          <Text style={styles.kpiTitle}>Inactive</Text>
          <Text style={styles.kpiSub}>30+ days quiet</Text>
        </View>

        <View style={[styles.kpiCard, { borderColor: StatusColors.paused.text }]}>
          <Text style={[styles.kpiValue, { color: StatusColors.paused.text }]}>
            {pausedCount}
          </Text>
          <Text style={styles.kpiTitle}>Paused</Text>
          <Text style={styles.kpiSub}>Via logged call</Text>
        </View>

        <View style={[styles.kpiCard, { borderColor: StatusColors.left.text }]}>
          <Text style={[styles.kpiValue, { color: StatusColors.left.text }]}>
            {leftCount}
          </Text>
          <Text style={styles.kpiTitle}>Left / Discontinued</Text>
          <Text style={styles.kpiSub}>Keeps same roll no</Text>
        </View>
      </View>

      {/* Class Level Breakdown */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="stats-chart" size={18} color={BrandColors.primary} />
          <Text style={styles.sectionTitle}>Level Enrolment Distribution</Text>
        </View>

        <View style={styles.barGroup}>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Level 1: Beginner</Text>
            <Text style={styles.barValue}>{l1Count} students</Text>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${total > 0 ? (l1Count / total) * 100 : 0}%` }]} />
          </View>
        </View>

        <View style={styles.barGroup}>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Level 2: Intermediate</Text>
            <Text style={styles.barValue}>{l2Count} students</Text>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${total > 0 ? (l2Count / total) * 100 : 0}%` }]} />
          </View>
        </View>

        <View style={styles.barGroup}>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>Level 3: Advanced</Text>
            <Text style={styles.barValue}>{l3Count} students</Text>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${total > 0 ? (l3Count / total) * 100 : 0}%` }]} />
          </View>
        </View>
      </View>

      {/* Guru Approval Desk (if materials waiting) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="checkmark-done-circle" size={20} color="#0284C7" />
          <Text style={styles.sectionTitle}>Guru Material Approvals</Text>
        </View>

        {pendingMaterials.length === 0 ? (
          <Text style={styles.emptyNotice}>All curriculum materials are approved.</Text>
        ) : (
          pendingMaterials.map((mat) => (
            <View key={mat.id} style={styles.approvalItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.approvalTitle}>{mat.title}</Text>
                <Text style={styles.approvalSubtitle}>
                  Suggested for Level {mat.level_id} • Kind: {mat.kind.toUpperCase()}
                </Text>
              </View>
              {isGuru ? (
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleApproveMaterial(mat)}
                >
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.waitingText}>Awaiting Guru</Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* Automated pg_cron Maintenance Jobs Notice */}
      <View style={styles.infoBox}>
        <Ionicons name="hardware-chip-outline" size={20} color="#64748B" />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>Postgres Cron Schedules</Text>
          <Text style={styles.infoDesc}>
            • 06:00 IST: refresh_student_statuses() assigns call tasks & updates quiet students{'\n'}
            • 21:00 IST: close_open_visits() closes any check-in left open at centre closing time
          </Text>
        </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  retentionBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  retentionNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803D',
  },
  retentionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#166534',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flexBasis: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  kpiTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
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
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  barGroup: {
    marginBottom: 10,
  },
  barRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  barValue: {
    fontSize: 12,
    color: '#64748B',
  },
  barBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: BrandColors.primary,
  },
  emptyNotice: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  approvalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  approvalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  approvalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  approveBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  waitingText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 10,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  infoDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
});
