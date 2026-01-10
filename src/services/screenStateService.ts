import { NativeModules, Platform } from 'react-native';

const { ScreenStateModule } = NativeModules;

/**
 * Check if the screen is currently interactive (on).
 * - Returns true if screen is on (user switched apps)
 * - Returns false if screen is off (user pressed power button)
 *
 * Only works on Android. Returns true on other platforms.
 */
export async function isScreenInteractive(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // On iOS, assume screen is interactive (conservative approach)
    return true;
  }

  try {
    return await ScreenStateModule.isScreenInteractive();
  } catch (error) {
    console.error('Failed to check screen state:', error);
    // If we can't determine, assume screen is on (pause to be safe)
    return true;
  }
}
