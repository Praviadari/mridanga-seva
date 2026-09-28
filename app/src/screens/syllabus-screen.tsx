import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/data-context';
import { BrandColors } from '../constants/theme';

export const SyllabusScreen: React.FC = () => {
  const { syllabus, levels, materials, tickSyllabus } = useData();
  const [selectedLevelId, setSelectedLevelId] = useState<number>(1);

  const levelSyllabus = syllabus.filter((item) => item.level_id === selectedLevelId);
  const levelMaterials = materials.filter((m) => m.level_id === selectedLevelId);

  const handleOpenLink = (url?: string) => {
    if (url) Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      {/* Level Selector Tabs */}
      <View style={styles.tabBar}>
        {levels.map((lvl) => {
          const isSelected = selectedLevelId === lvl.id;
          return (
            <TouchableOpacity
              key={lvl.id}
              style={[styles.tab, isSelected && styles.tabActive]}
              onPress={() => setSelectedLevelId(lvl.id)}
            >
              <Text style={[styles.tabTitle, isSelected && styles.tabTitleActive]}>
                Level {lvl.id}
              </Text>
              <Text style={[styles.tabSubtitle, isSelected && styles.tabSubtitleActive]}>
                {lvl.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Syllabus Section */}
        <View style={styles.sectionHeader}>
          <Ionicons name="book" size={18} color={BrandColors.primary} />
          <Text style={styles.sectionTitle}>Curriculum & Bols</Text>
        </View>

        <View style={styles.itemList}>
          {levelSyllabus.map((item, idx) => {
            const isDone = Boolean(item.completed);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.itemCard, isDone && styles.itemCardDone]}
                activeOpacity={0.7}
                onPress={() => tickSyllabus(item.id, !isDone)}
              >
                <TouchableOpacity
                  style={styles.checkboxTouch}
                  onPress={() => tickSyllabus(item.id, !isDone)}
                >
                  <Ionicons
                    name={isDone ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isDone ? BrandColors.primary : '#94A3B8'}
                  />
                </TouchableOpacity>

                <View style={styles.itemTextCol}>
                  <View style={styles.itemTitleRow}>
                    <Text style={[styles.itemIndex, isDone && styles.itemDoneText]}>
                      {idx + 1}.
                    </Text>
                    <Text style={[styles.itemTitle, isDone && styles.itemDoneText]}>
                      {item.title}
                    </Text>
                  </View>
                  {item.description ? (
                    <Text style={styles.itemDesc}>{item.description}</Text>
                  ) : null}
                  {item.done_on ? (
                    <Text style={styles.doneDate}>Ticked on: {item.done_on}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Materials / Practice Notes Section */}
        <View style={[styles.sectionHeader, { marginTop: 20 }]}>
          <Ionicons name="film" size={18} color={BrandColors.primary} />
          <Text style={styles.sectionTitle}>Lesson Materials & Practice Videos</Text>
        </View>

        {levelMaterials.length === 0 ? (
          <Text style={styles.emptyText}>No materials uploaded yet for this level.</Text>
        ) : (
          <View style={styles.materialList}>
            {levelMaterials.map((mat) => (
              <View key={mat.id} style={styles.materialCard}>
                <View style={styles.materialHeader}>
                  <Ionicons
                    name={mat.kind === 'youtube' ? 'logo-youtube' : 'document-text'}
                    size={20}
                    color={mat.kind === 'youtube' ? '#DC2626' : BrandColors.primary}
                  />
                  <Text style={styles.materialTitle}>{mat.title}</Text>
                </View>

                {mat.body ? <Text style={styles.materialBody}>{mat.body}</Text> : null}

                {mat.url ? (
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => handleOpenLink(mat.url)}
                  >
                    <Ionicons name="play-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.linkBtnText}>Watch on YouTube</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: BrandColors.primaryLight,
  },
  tabTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTitleActive: {
    color: BrandColors.primaryDark,
  },
  tabSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  tabSubtitleActive: {
    color: BrandColors.primary,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemList: {
    gap: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  itemCardDone: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  checkboxTouch: {
    paddingTop: 2,
  },
  itemTextCol: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    gap: 4,
  },
  itemIndex: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
  },
  itemDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  doneDate: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 4,
  },
  itemDoneText: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  materialList: {
    gap: 10,
  },
  materialCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  materialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  materialTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  materialBody: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  linkBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  linkBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
});
