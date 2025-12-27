import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import { AmbientCategory } from '../types';

interface CategoryTagsProps {
  categories: { id: AmbientCategory; label: string }[];
  selectedCategories: Set<string>;
  onSelect: (category: AmbientCategory) => void;
}

export function CategoryTags({
  categories,
  selectedCategories,
  onSelect,
}: CategoryTagsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {categories.map(cat => {
        // "All" is selected when no categories are selected
        const isSelected = cat.id === 'all'
          ? selectedCategories.size === 0
          : selectedCategories.has(cat.id);
        return (
          <TouchableOpacity
            key={cat.id}
            style={[styles.tag, isSelected && styles.selectedTag]}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tagText, isSelected && styles.selectedTagText]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  content: {
    paddingHorizontal: 4,
    gap: 8,
    flexDirection: 'row',
  },
  tag: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
  },
  selectedTag: {
    backgroundColor: COLORS.text,
  },
  tagText: {
    fontSize: FONTS.size.small,
    fontWeight: FONTS.medium,
    color: COLORS.textSecondary,
  },
  selectedTagText: {
    color: COLORS.background,
  },
});
