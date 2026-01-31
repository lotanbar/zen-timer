import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { COLORS, FONTS } from '../constants/theme';
import type { PartialDownload } from '../services/assetCacheService';

interface PartialDownloadModalProps {
  visible: boolean;
  partialDownloads: PartialDownload[];
  onContinue: () => void;
  onDelete: () => void;
}

export const PartialDownloadModal: React.FC<PartialDownloadModalProps> = ({
  visible,
  partialDownloads,
  onContinue,
  onDelete,
}) => {
  const totalPartialMB = partialDownloads.reduce(
    (sum, d) => sum + d.downloadedMB,
    0
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            <Text style={styles.title}>Incomplete Downloads Detected</Text>

            <Text style={styles.message}>
              Found {partialDownloads.length} incomplete download
              {partialDownloads.length !== 1 ? 's' : ''}.
            </Text>

            <View style={styles.detailsContainer}>
              {partialDownloads.map((download, index) => (
                <View key={download.assetId} style={styles.downloadItem}>
                  <Text style={styles.downloadName}>
                    {download.assetName || download.assetId}
                  </Text>
                  <Text style={styles.downloadProgress}>
                    {download.downloadedMB.toFixed(1)} MB /{' '}
                    {download.totalMB.toFixed(1)} MB (
                    {Math.round(
                      (download.downloadedMB / download.totalMB) * 100
                    )}
                    %)
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.warningContainer}>
              <Text style={styles.warningText}>
                ⚠️  You've already used {totalPartialMB.toFixed(1)} MB of quota
                for these partial downloads.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, styles.continueButton]}
              onPress={onContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>
                Continue Downloads (uses remaining quota)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={onDelete}
              activeOpacity={0.8}
            >
              <Text style={[styles.buttonText, styles.deleteButtonText]}>
                Delete Incomplete Files (quota already used)
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.size.large,
    fontWeight: FONTS.semibold,
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: FONTS.size.medium,
    color: COLORS.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  detailsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  downloadItem: {
    marginBottom: 12,
  },
  downloadName: {
    fontSize: FONTS.size.medium,
    color: COLORS.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  downloadProgress: {
    fontSize: FONTS.size.small,
    color: COLORS.textSecondary,
  },
  warningContainer: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  warningText: {
    fontSize: FONTS.size.small,
    color: '#FFC107',
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  continueButton: {
    backgroundColor: COLORS.text,
  },
  deleteButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  buttonText: {
    color: COLORS.background,
    fontSize: FONTS.size.medium,
    fontWeight: '600',
    textAlign: 'center',
  },
  deleteButtonText: {
    color: COLORS.textSecondary,
  },
});
