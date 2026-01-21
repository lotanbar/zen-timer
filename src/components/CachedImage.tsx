import React, { useState, useEffect } from 'react';
import { View, Image, ActivityIndicator, Text, StyleSheet, ImageSourcePropType } from 'react-native';
import { Asset } from '../types';
import { assetCacheService } from '../services/assetCacheService';
import { COLORS } from '../constants/theme';

// Bundled image assets map
const BUNDLED_IMAGES: { [key: string]: ImageSourcePropType } = {
  dev_local_wind: require('../../assets/dev/dev_local_wind.png'),
  dev_local_frogs: require('../../assets/dev/dev_local_frogs.png'),
};

interface CachedImageProps {
  asset: Asset;
  style?: object;
}

function isBundledImage(imageUrl: string): boolean {
  return imageUrl.startsWith('BUNDLED:');
}

function getBundledImageSource(imageUrl: string): ImageSourcePropType | null {
  if (!isBundledImage(imageUrl)) return null;
  const key = imageUrl.replace('BUNDLED:', '');
  return BUNDLED_IMAGES[key] || null;
}

export function CachedImage({ asset, style }: CachedImageProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Check for bundled image
  const bundledSource = getBundledImageSource(asset.imageUrl);

  useEffect(() => {
    // Skip loading logic for bundled images
    if (bundledSource) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadImage = async () => {
      setLoading(true);
      setError(false);

      // First try cached version
      const cachedPath = assetCacheService.getCachedImagePath(asset.id);
      if (cachedPath && mounted) {
        setUri(cachedPath);
        return;
      }

      // Try to cache the image
      const downloadedPath = await assetCacheService.cacheImage(asset);
      if (mounted) {
        if (downloadedPath) {
          setUri(downloadedPath);
        } else {
          // Fallback to remote URL
          setUri(asset.imageUrl);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
    };
  }, [asset.id, retryCount, bundledSource]);

  const handleError = () => {
    setLoading(false);
    if (retryCount < 2) {
      // Retry with remote URL
      setRetryCount((c) => c + 1);
      setUri(asset.imageUrl);
    } else {
      setError(true);
    }
  };

  // Render bundled image directly
  if (bundledSource) {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={bundledSource}
          style={styles.image}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onLoad={() => setLoading(false)}
        onError={handleError}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        </View>
      )}
      {error && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.errorIcon}>!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.border,
  },
  errorIcon: {
    color: COLORS.textSecondary,
    fontSize: 20,
    fontWeight: 'bold',
  },
});
