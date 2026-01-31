import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

interface DownloadProgressModalProps {
  visible: boolean;
  assetName: string;
  downloadedMB: number;
  totalMB: number;
  percent: number;
}

export const DownloadProgressModal: React.FC<DownloadProgressModalProps> = ({
  visible,
  assetName,
  downloadedMB,
  totalMB,
  percent,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Downloading</Text>
          <Text style={styles.assetName}>{assetName}</Text>

          <ActivityIndicator
            size="large"
            color={COLORS.text}
            style={styles.spinner}
          />

          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, Math.max(0, percent))}%` },
                ]}
              />
            </View>
          </View>

          <Text style={styles.progressText}>{Math.round(percent)}%</Text>

          <Text style={styles.detailText}>
            {downloadedMB.toFixed(1)} MB / {totalMB.toFixed(1)} MB
          </Text>

          <Text style={styles.note}>
            Please wait, don't close the app
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 32,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.size.large,
    fontWeight: FONTS.semibold,
    color: COLORS.text,
    marginBottom: 8,
  },
  assetName: {
    fontSize: FONTS.size.medium,
    color: COLORS.textSecondary,
    marginBottom: 24,
  },
  spinner: {
    marginVertical: 16,
  },
  progressContainer: {
    width: '100%',
    marginVertical: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.text,
    borderRadius: 4,
  },
  progressText: {
    fontSize: FONTS.size.xlarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: 8,
  },
  detailText: {
    fontSize: FONTS.size.small,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  note: {
    fontSize: FONTS.size.small,
    color: COLORS.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
  },
});
