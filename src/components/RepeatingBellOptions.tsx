import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { RepeatBellOptions, Duration } from '../types';
import { COLORS, FONTS } from '../constants/theme';
import { getIntervalDisplay, getTotalSeconds, isRepeatBellValid } from '../store/preferencesStore';
import { ScrollPicker } from './ScrollPicker';

interface RepeatingBellOptionsProps {
  options: RepeatBellOptions;
  duration: Duration;
  onChange: (options: RepeatBellOptions) => void;
}

const COUNTS = Array.from({ length: 10 }, (_, i) => i + 1);

export function RepeatingBellOptions({
  options,
  duration,
  onChange,
}: RepeatingBellOptionsProps) {
  const toggleEnabled = () => {
    onChange({ ...options, enabled: !options.enabled });
  };

  const totalSeconds = getTotalSeconds(duration);
  const totalMinutes = Math.floor(totalSeconds / 60);

  // Limit minutes options to less than total duration (at least 1 minute)
  const maxMinutes = Math.max(1, totalMinutes - 1);
  const minutesOptions = Array.from({ length: maxMinutes }, (_, i) => i + 1);

  const beforeEndMinutes = Math.min(Math.round(options.beforeEndSeconds / 60), maxMinutes);
  const isValid = isRepeatBellValid(totalSeconds, options);
  const intervalDisplay = getIntervalDisplay(options);

  const handleMinutesChange = (minutes: number) => {
    onChange({ ...options, beforeEndSeconds: minutes * 60 });
  };

  // Auto-adjust if current value exceeds max
  useEffect(() => {
    const currentMinutes = Math.round(options.beforeEndSeconds / 60);
    if (currentMinutes > maxMinutes) {
      onChange({ ...options, beforeEndSeconds: maxMinutes * 60 });
    }
  }, [maxMinutes, options.beforeEndSeconds]);

  return (
    <View style={styles.container}>
      {options.enabled && (
        <View style={styles.optionsContainer}>
          <View style={styles.pickersRow}>
            <ScrollPicker
              values={COUNTS}
              selectedValue={options.count}
              onChange={(count) => onChange({ ...options, count })}
              label="Times"
              size="small"
            />

            <ScrollPicker
              values={minutesOptions}
              selectedValue={beforeEndMinutes}
              onChange={handleMinutesChange}
              label="Min before end"
              size="small"
            />
          </View>

          <Text style={[styles.calculation, !isValid && styles.calculationInvalid]}>
            {!isValid ? 'Exceeds duration — will be skipped' : intervalDisplay}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={toggleEnabled}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, options.enabled && styles.checkboxChecked]}>
          {options.enabled && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>Repeat?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  checkboxRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.text,
  },
  checkmark: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    color: COLORS.text,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
  optionsContainer: {
    marginBottom: 20,
    gap: 16,
  },
  pickersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  calculation: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.small,
    fontWeight: FONTS.medium,
    textAlign: 'center',
    marginTop: 12,
  },
  calculationInvalid: {
    color: '#ff6b6b',
  },
});
