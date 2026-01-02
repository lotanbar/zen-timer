import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DurationPicker } from '../components';
import { usePreferencesStore } from '../store/preferencesStore';
import { COLORS, FONTS } from '../constants/theme';
import { RootStackParamList, Duration } from '../types';

type DurationScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Duration'>;
};

export function DurationScreen({ navigation }: DurationScreenProps) {
  const { duration: storeDuration, setDuration } = usePreferencesStore();
  const [localDuration, setLocalDuration] = useState<Duration>(storeDuration);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSubmit = () => {
    setDuration(localDuration);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Duration</Text>
        <DurationPicker duration={localDuration} onChange={setLocalDuration} />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.7}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    color: COLORS.text,
    fontSize: FONTS.size.xlarge,
    fontWeight: FONTS.semibold,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  backButtonText: {
    color: COLORS.text,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.medium,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: COLORS.text,
    alignItems: 'center',
  },
  submitButtonText: {
    color: COLORS.background,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
});
