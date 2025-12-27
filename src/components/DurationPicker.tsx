import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScrollPicker } from './ScrollPicker';
import { Duration } from '../types';

interface DurationPickerProps {
  duration: Duration;
  onChange: (duration: Duration) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const SECONDS = Array.from({ length: 60 }, (_, i) => i);

export function DurationPicker({ duration, onChange }: DurationPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.pickersRow}>
        <ScrollPicker
          values={HOURS}
          selectedValue={duration.hours}
          onChange={(hours) => onChange({ ...duration, hours })}
          label="hours"
        />
        <ScrollPicker
          values={MINUTES}
          selectedValue={duration.minutes}
          onChange={(minutes) => onChange({ ...duration, minutes })}
          label="min"
        />
        <ScrollPicker
          values={SECONDS}
          selectedValue={duration.seconds}
          onChange={(seconds) => onChange({ ...duration, seconds })}
          label="sec"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
});
