import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Pressable, View, Text, StyleSheet, Image, Animated, Dimensions } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BUTTON_HEIGHT = SCREEN_HEIGHT * 0.10;
const BORDER_RADIUS = 12;

interface StepButtonProps {
  label: string;
  value: string;
  imageUrl?: string | null;
  onPress: () => void;
}

export interface StepButtonRef {
  pulse: () => void;
}

export const StepButton = forwardRef<StepButtonRef, StepButtonProps>(
  ({ label, value, imageUrl, onPress }, ref) => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    const pulse = () => {
      animatedValue.setValue(1);
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 1500,
        useNativeDriver: false,
      }).start();
    };

    useImperativeHandle(ref, () => ({
      pulse,
    }));

    const borderColor = animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [COLORS.border, COLORS.textSecondary],
    });

    return (
      <Animated.View style={[styles.containerOuter, { borderColor }]}>
        <Pressable
          style={({ pressed }) => [
            styles.container,
            pressed && styles.containerPressed,
          ]}
          onPress={onPress}
        >
          {({ pressed }) => (
            <View style={styles.innerContent}>
              <Text style={[styles.label, pressed && styles.labelPressed]}>{label}</Text>
              <View style={styles.valueContainer}>
                <Text style={[styles.value, pressed && styles.valuePressed]} numberOfLines={1}>{value}</Text>
                {imageUrl && (
                  <Image source={{ uri: imageUrl }} style={styles.thumbnail} />
                )}
              </View>
            </View>
          )}
        </Pressable>
      </Animated.View>
    );
  }
);

const styles = StyleSheet.create({
  containerOuter: {
    width: '100%',
    height: BUTTON_HEIGHT,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS,
  },
  container: {
    flex: 1,
    borderRadius: BORDER_RADIUS - 1,
  },
  containerPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  innerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  label: {
    color: COLORS.text,
    fontSize: FONTS.size.large,
    fontWeight: FONTS.medium,
  },
  labelPressed: {
    color: '#ffffff',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  value: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.medium,
    maxWidth: 150,
  },
  valuePressed: {
    color: COLORS.text,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
});
