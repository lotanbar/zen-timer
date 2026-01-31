import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { COLORS, FONTS } from '../constants/theme';

interface VerificationModalProps {
  visible: boolean;
  onClose?: () => void;
}

const CODE_LENGTH = 6;

export const VerificationModal: React.FC<VerificationModalProps> = ({
  visible,
  onClose,
}) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const { verifyCode, isLoading, error } = useAuthStore();

  const handleChangeText = (text: string, index: number) => {
    // Only allow numbers and letters
    const sanitized = text.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (sanitized.length === 0) {
      // Handle backspace
      const newCode = [...code];
      newCode[index] = '';
      setCode(newCode);

      // Move to previous input
      if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    // Handle paste of full code
    if (sanitized.length === CODE_LENGTH) {
      const newCode = sanitized.split('').slice(0, CODE_LENGTH);
      setCode(newCode);
      inputRefs.current[CODE_LENGTH - 1]?.focus();
      return;
    }

    // Handle single character
    const newCode = [...code];
    newCode[index] = sanitized[0] || '';
    setCode(newCode);

    // Auto-focus next input
    if (sanitized && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      // Move to previous input on backspace if current is empty
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== CODE_LENGTH) return;

    const success = await verifyCode(fullCode);
    if (success && onClose) {
      onClose();
    }
  };

  const isCodeComplete = code.every(digit => digit !== '');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          <View style={styles.modal}>
            <Text style={styles.title}>Authentication Required</Text>
            <Text style={styles.subtitle}>
              You need to be authenticated to stream meditation data
            </Text>
            <Text style={styles.codeLabel}>Enter your 6-digit code:</Text>

            <View style={styles.codeContainer}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => (inputRefs.current[index] = ref)}
                  style={[
                    styles.codeInput,
                    digit && styles.codeInputFilled,
                    error && styles.codeInputError,
                  ]}
                  value={digit}
                  onChangeText={text => handleChangeText(text, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  keyboardType="default"
                  maxLength={1}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isLoading}
                  selectTextOnFocus
                />
              ))}
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[
                styles.button,
                (!isCodeComplete || isLoading) && styles.buttonDisabled,
              ]}
              onPress={handleVerify}
              disabled={!isCodeComplete || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            {onClose && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={isLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.helpText}>
              Don't have a code? Contact the app administrator.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    paddingHorizontal: 20,
  },
  modal: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.size.xlarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.size.medium,
    color: COLORS.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  codeLabel: {
    fontSize: FONTS.size.small,
    color: COLORS.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  codeInput: {
    width: 48,
    height: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    fontSize: 24,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  codeInputFilled: {
    borderColor: COLORS.text,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  codeInputError: {
    borderColor: '#ff4444',
  },
  error: {
    color: '#ff4444',
    fontSize: FONTS.size.small,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.text,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: COLORS.background,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
  cancelButton: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.medium,
    fontWeight: FONTS.semibold,
  },
  helpText: {
    color: COLORS.textSecondary,
    fontSize: FONTS.size.small,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
});
