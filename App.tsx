import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { audioService } from './src/services/audioService';
import { assetCacheService } from './src/services/assetCacheService';
import { getBellAssets } from './src/services/assetDiscoveryService';
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


export default function App() {
  useEffect(() => {
    const init = async () => {
      await audioService.init();
      await assetCacheService.init();

      // Load bell assets and cache images in background
      try {
        const bells = await getBellAssets();
        assetCacheService.cacheAllImages(bells);
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
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
