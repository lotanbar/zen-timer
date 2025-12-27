import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DurationPicker } from '../components/DurationPicker';
import { usePreferencesStore, getTotalSeconds } from '../store/preferencesStore';
import { COLORS, FONTS } from '../constants/theme';
import { RootStackParamList } from '../types';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { duration, setDuration } = usePreferencesStore();
  const totalSeconds = getTotalSeconds(duration);
  const canStart = totalSeconds > 0;

  const handleStart = () => {
    navigation.navigate('Timer');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <DurationPicker duration={duration} onChange={setDuration} />
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.startButton, !canStart && styles.startButtonDisabled]}
          onPress={handleStart}
          activeOpacity={0.8}
          disabled={!canStart}
        >
          <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>Start</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  startButton: {
    backgroundColor: COLORS.text,
    paddingVertical: 14,
    paddingHorizontal: 50,
    borderRadius: 8,
  },
  startButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  startButtonText: {
    color: COLORS.background,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.semibold,
  },
  startButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
});
