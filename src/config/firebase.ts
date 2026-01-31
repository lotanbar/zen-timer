/**
 * Firebase configuration for user authentication and quota tracking
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Create a new project (or use existing)
 * 3. Add an Android app to your project
 * 4. Download google-services.json and place in /android/app/
 * 5. In Firebase console, go to: Build > Realtime Database > Create Database
 * 6. Start in TEST MODE (we'll lock it down after)
 * 7. Copy your config below (from Firebase Console > Project Settings > Your Apps)
 */

import database from '@react-native-firebase/database';

export const firebaseConfig = {
  databaseURL: "https://zen-timer-7764e-default-rtdb.europe-west1.firebasedatabase.app/",
};

/**
 * Firebase Database reference for users
 * Structure: /users/{verificationCode}/{ name, quotaLimitMB, quotaUsedMB, resetDate, cachedAssets[] }
 */
export const usersRef = () => database().ref('/users');

/**
 * Get user data by verification code
 */
export const getUserByCode = async (verificationCode: string) => {
  const snapshot = await usersRef().child(verificationCode).once('value');
  return snapshot.val();
};

/**
 * Update user's quota usage
 */
export const updateQuotaUsage = async (
  verificationCode: string,
  usedMB: number
) => {
  await usersRef().child(verificationCode).update({
    quotaUsedMB: usedMB,
  });
};

/**
 * Add asset to user's cached assets list
 */
export const addCachedAsset = async (
  verificationCode: string,
  assetId: string
) => {
  const userRef = usersRef().child(verificationCode);
  const snapshot = await userRef.child('cachedAssets').once('value');
  const cachedAssets = snapshot.val() || [];

  if (!cachedAssets.includes(assetId)) {
    await userRef.child('cachedAssets').set([...cachedAssets, assetId]);
  }
};

/**
 * Check if user has cached an asset
 */
export const hasAssetCached = async (
  verificationCode: string,
  assetId: string
): Promise<boolean> => {
  const snapshot = await usersRef()
    .child(verificationCode)
    .child('cachedAssets')
    .once('value');
  const cachedAssets = snapshot.val() || [];
  return cachedAssets.includes(assetId);
};
