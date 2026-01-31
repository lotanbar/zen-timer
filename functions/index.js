const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

// Bunny.net configuration
const BUNNY_SECRET = '267a4c7a-f95a-41e4-8b9a-8249ed065e5c';
const BUNNY_CDN_URL = 'https://zentimer-assets.b-cdn.net';
const URL_EXPIRATION_SECONDS = 3600; // 1 hour

/**
 * Generate a signed URL for Bunny.net CDN
 * @param {string} path - File path (e.g., "/audio/ocean-waves.mp3")
 * @param {number} expirationSeconds - How long the URL is valid
 * @returns {object} - { signedUrl, expires }
 */
function generateSignedUrl(path, expirationSeconds = URL_EXPIRATION_SECONDS) {
  // Calculate expiration timestamp
  const expires = Math.floor(Date.now() / 1000) + expirationSeconds;

  // Create hash: md5(secret + path + expires)
  const hashString = `${BUNNY_SECRET}${path}${expires}`;
  const hash = crypto.createHash('md5').update(hashString).digest('base64');

  // URL-safe base64 encoding
  const token = hash
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Build signed URL
  const signedUrl = `${BUNNY_CDN_URL}${path}?token=${token}&expires=${expires}`;

  return { signedUrl, expires };
}

/**
 * Cloud Function: Get signed download URL for an asset
 * Called from the React Native app
 */
exports.getSignedUrl = functions.https.onCall(async (data, context) => {
  const { assetId, assetType, verificationCode } = data;

  // 1. Validate input
  if (!assetId || !assetType || !verificationCode) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required parameters: assetId, assetType, verificationCode'
    );
  }

  try {
    // 2. Verify user exists and has quota
    const userRef = admin.database().ref(`users/${verificationCode}`);
    const snapshot = await userRef.once('value');
    const user = snapshot.val();

    if (!user) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const quotaLimitMB = user.quotaLimitMB || 1000;
    const quotaUsedMB = user.quotaUsedMB || 0;

    // -1 means unlimited quota
    if (quotaLimitMB !== -1 && quotaUsedMB >= quotaLimitMB) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Quota exceeded. Cannot download more files.'
      );
    }

    // 3. Build file path
    let path;
    if (assetType === 'audio') {
      path = `/audio/${assetId}.mp3`;
    } else if (assetType === 'image') {
      // Determine extension based on asset type (bell = png, others = jpg)
      const ext = assetId.includes('bell') ? 'png' : 'jpg';
      path = `/images/${assetId}.${ext}`;
    } else {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'assetType must be "audio" or "image"'
      );
    }

    // 4. Generate signed URL
    const { signedUrl, expires } = generateSignedUrl(path);

    // 5. Log request (optional - for monitoring)
    console.log(`Generated signed URL for ${verificationCode}: ${path}`);

    return {
      signedUrl,
      expires,
      expiresIn: URL_EXPIRATION_SECONDS,
    };
  } catch (error) {
    console.error('Error generating signed URL:', error);

    // Re-throw HttpsErrors
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    // Wrap other errors
    throw new functions.https.HttpsError('internal', 'Failed to generate signed URL');
  }
});

/**
 * Cloud Function: Batch get signed URLs for multiple assets
 * Useful for downloading multiple files efficiently
 */
exports.getBatchSignedUrls = functions.https.onCall(async (data, context) => {
  const { assets, verificationCode } = data;

  // 1. Validate input
  if (!Array.isArray(assets) || !verificationCode) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required parameters: assets (array), verificationCode'
    );
  }

  if (assets.length > 50) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Maximum 50 assets per batch request'
    );
  }

  try {
    // 2. Verify user exists and has quota
    const userRef = admin.database().ref(`users/${verificationCode}`);
    const snapshot = await userRef.once('value');
    const user = snapshot.val();

    if (!user) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const quotaLimitMB = user.quotaLimitMB || 1000;
    const quotaUsedMB = user.quotaUsedMB || 0;

    // -1 means unlimited quota
    if (quotaLimitMB !== -1 && quotaUsedMB >= quotaLimitMB) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Quota exceeded. Cannot download more files.'
      );
    }

    // 3. Generate signed URLs for all assets
    const results = assets.map(({ assetId, assetType }) => {
      let path;
      if (assetType === 'audio') {
        path = `/audio/${assetId}.mp3`;
      } else if (assetType === 'image') {
        const ext = assetId.includes('bell') ? 'png' : 'jpg';
        path = `/images/${assetId}.${ext}`;
      } else {
        return { assetId, error: 'Invalid asset type' };
      }

      const { signedUrl, expires } = generateSignedUrl(path);
      return { assetId, assetType, signedUrl, expires };
    });

    console.log(`Generated ${results.length} signed URLs for ${verificationCode}`);

    return { urls: results, expiresIn: URL_EXPIRATION_SECONDS };
  } catch (error) {
    console.error('Error generating batch signed URLs:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError('internal', 'Failed to generate signed URLs');
  }
});
