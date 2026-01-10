import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { audioService } from './src/services/audioService';
import { assetCacheService } from './src/services/assetCacheService';
import { getAmbientAssets, getBellAssets } from './src/services/assetDiscoveryService';
import { usePreferencesStore } from './src/store/preferencesStore';
import { COLORS } from './src/constants/theme';

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,
    card: COLORS.background,
  },
};

// Preload selected ambience audio when it changes
function AmbiencePreloader() {
  const ambienceId = usePreferencesStore((state) => state.ambienceId);

  useEffect(() => {
    if (!ambienceId) return;

    const preload = async () => {
      try {
        const assets = await getAmbientAssets();
        const asset = assets.find((a) => a.id === ambienceId);
        if (asset && !assetCacheService.isBundledAudio(asset)) {
          await assetCacheService.cacheAudio(asset);
        }
      } catch (error) {
        console.error('Failed to preload ambience:', error);
      }
    };
    preload();
  }, [ambienceId]);

  return null;
}

export default function App() {
  useEffect(() => {
    const init = async () => {
      await audioService.init();
      await assetCacheService.init();

      // Load assets dynamically and cache images in background
      try {
        const [ambient, bells] = await Promise.all([
          getAmbientAssets(),
          getBellAssets(),
        ]);
        assetCacheService.cacheAllImages([...ambient, ...bells]);
      } catch (error) {
        console.error('Failed to load assets for caching:', error);
      }
    };
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <SafeAreaProvider>
        <NavigationContainer theme={DarkTheme}>
          <StatusBar style="light" />
          <AmbiencePreloader />
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
