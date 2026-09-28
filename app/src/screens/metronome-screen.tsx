import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandColors } from '../constants/theme';

interface TaalDefinition {
  name: string;
  beats: number;
  subdivisions: number;
  bols: string[];
}

const TAALS: TaalDefinition[] = [
  {
    name: 'Kaherva Taal',
    beats: 8,
    subdivisions: 4,
    bols: ['dhā', 'ge', 'na', 'ti', 'nā', 'ke', 'dhi', 'na'],
  },
  {
    name: 'Dadra Taal',
    beats: 6,
    subdivisions: 3,
    bols: ['dhā', 'dhi', 'nā', 'dhā', 'ti', 'nā'],
  },
  {
    name: 'Bhajani Taal',
    beats: 8,
    subdivisions: 4,
    bols: ['dhin', 'nā', 'tī', 'nā', 'kat', 'tā', 'tī', 'nā'],
  },
  {
    name: 'Prabhupada / Dasapahira',
    beats: 16,
    subdivisions: 4,
    bols: [
      'dhā', 'te', 'te', 'tā',
      'gha', 'na', 'tā', 'tā',
      'khe', 'te', 'te', 'tā',
      'dhin', 'nā', 'tī', 'nā',
    ],
  },
];

export const MetronomeScreen: React.FC = () => {
  const [bpm, setBpm] = useState<number>(90);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<number>(0);
  const [selectedTaal, setSelectedTaal] = useState<TaalDefinition>(TAALS[0]);

  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = Math.round((60 / bpm) * 1000);
    const interval = setInterval(() => {
      setCurrentBeat((prev) => (prev + 1) % selectedTaal.beats);
    }, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [isPlaying, bpm, selectedTaal]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      setCurrentBeat(0);
    } else {
      setCurrentBeat(0);
      setIsPlaying(true);
    }
  };

  const handleAdjustBpm = (delta: number) => {
    setBpm((prev) => Math.min(220, Math.max(40, prev + delta)));
  };

  const handleSelectTaal = (taal: TaalDefinition) => {
    setSelectedTaal(taal);
    setCurrentBeat(0);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Taal & Rhythmic Metronome</Text>
        <Text style={styles.subtitle}>
          Practice tool with animated bols for mridanga students
        </Text>
      </View>

      {/* Taal Selector */}
      <View style={styles.taalRow}>
        {TAALS.map((t) => {
          const isSel = selectedTaal.name === t.name;
          return (
            <TouchableOpacity
              key={t.name}
              style={[styles.taalChip, isSel && styles.taalChipActive]}
              onPress={() => handleSelectTaal(t)}
            >
              <Text style={[styles.taalChipText, isSel && styles.taalChipTextActive]}>
                {t.name} ({t.beats}B)
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Primary Pulse Display Card */}
      <View style={styles.displayCard}>
        <Text style={styles.taalNameDisplay}>{selectedTaal.name}</Text>
        <Text style={styles.currentBolText}>
          {isPlaying ? selectedTaal.bols[currentBeat] || '—' : 'Tap Play'}
        </Text>
        <Text style={styles.beatCounter}>
          Beat {isPlaying ? currentBeat + 1 : 1} of {selectedTaal.beats}
        </Text>

        {/* Bols Grid Visualizer */}
        <View style={styles.bolsGrid}>
          {selectedTaal.bols.map((bol, idx) => {
            const isActive = isPlaying && currentBeat === idx;
            const isSam = idx === 0; // First beat is "Sam" (clapped / emphasized)
            return (
              <View
                key={idx}
                style={[
                  styles.bolBox,
                  isSam && styles.bolBoxSam,
                  isActive && styles.bolBoxActive,
                ]}
              >
                <Text style={[styles.bolIndex, isActive && styles.bolTextActive]}>
                  {idx + 1}
                </Text>
                <Text style={[styles.bolText, isActive && styles.bolTextActive]}>
                  {bol}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* BPM Controls */}
      <View style={styles.bpmCard}>
        <Text style={styles.bpmLabel}>TEMPO (Laya)</Text>
        <Text style={styles.bpmValue}>{bpm} <Text style={styles.bpmUnit}>BPM</Text></Text>

        <View style={styles.adjustRow}>
          <TouchableOpacity style={styles.adjustBtn} onPress={() => handleAdjustBpm(-5)}>
            <Text style={styles.adjustBtnText}>-5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.adjustBtn} onPress={() => handleAdjustBpm(-1)}>
            <Text style={styles.adjustBtnText}>-1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.adjustBtn} onPress={() => handleAdjustBpm(1)}>
            <Text style={styles.adjustBtnText}>+1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.adjustBtn} onPress={() => handleAdjustBpm(5)}>
            <Text style={styles.adjustBtnText}>+5</Text>
          </TouchableOpacity>
        </View>

        {/* Speed Presets */}
        <View style={styles.presetRow}>
          {[
            { label: 'Vilambit (Slow 60)', value: 60 },
            { label: 'Madhya (Medium 95)', value: 95 },
            { label: 'Drut (Fast 140)', value: 140 },
          ].map((preset) => (
            <TouchableOpacity
              key={preset.value}
              style={[styles.presetChip, bpm === preset.value && styles.presetChipActive]}
              onPress={() => setBpm(preset.value)}
            >
              <Text style={[styles.presetText, bpm === preset.value && styles.presetTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Play / Stop Master Button */}
      <TouchableOpacity
        style={[styles.playBtn, isPlaying && styles.stopBtn]}
        onPress={handleTogglePlay}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={24}
          color="#FFFFFF"
        />
        <Text style={styles.playBtnText}>
          {isPlaying ? 'PAUSE PRACTICE' : 'START METRONOME'}
        </Text>
      </TouchableOpacity>
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
    marginBottom: 4,
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
  taalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  taalChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taalChipActive: {
    backgroundColor: BrandColors.primaryLight,
    borderColor: BrandColors.primary,
  },
  taalChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  taalChipTextActive: {
    color: BrandColors.primaryDark,
    fontWeight: '700',
  },
  displayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
  },
  taalNameDisplay: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  currentBolText: {
    fontSize: 48,
    fontWeight: '800',
    color: BrandColors.primary,
    marginVertical: 6,
  },
  beatCounter: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 16,
  },
  bolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  bolBox: {
    width: 60,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  bolBoxSam: {
    borderColor: BrandColors.primary,
    borderWidth: 1.5,
  },
  bolBoxActive: {
    backgroundColor: BrandColors.primary,
    borderColor: BrandColors.primaryDark,
    transform: [{ scale: 1.08 }],
  },
  bolIndex: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
  },
  bolText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  bolTextActive: {
    color: '#FFFFFF',
  },
  bpmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bpmLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  bpmValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0F172A',
    marginVertical: 4,
  },
  bpmUnit: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 10,
  },
  adjustBtn: {
    width: 48,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  adjustBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: BrandColors.secondary,
    borderColor: BrandColors.secondary,
  },
  presetText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  presetTextActive: {
    color: '#FFFFFF',
  },
  playBtn: {
    backgroundColor: BrandColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  stopBtn: {
    backgroundColor: '#DC2626',
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
