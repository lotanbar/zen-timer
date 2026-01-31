const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

// Bunny.net configuration
const BUNNY_SECRET = '267a4c7a-f95a-41e4-8b9a-8249ed065e5c';
const BUNNY_CDN_URL = 'https://zentimer-assets.b-cdn.net';
const URL_EXPIRATION_SECONDS = 3600; // 1 hour

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 200; // Max 200 requests per minute

/**
 * Check and update rate limit for a user
 * @param {string} verificationCode - User's verification code
 * @returns {Promise<boolean>} - true if allowed, false if rate limited
 */
async function checkRateLimit(verificationCode) {
  const now = Date.now();
  const rateLimitRef = admin.database().ref(`rateLimit/${verificationCode}`);

  const result = await rateLimitRef.transaction((current) => {
    if (!current) {
      // First request
      return { count: 1, windowStart: now };
    }

    if (now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
      // Window expired, reset
      return { count: 1, windowStart: now };
    }

    if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
      // Rate limited - abort transaction by returning undefined
      return;
    }

    // Increment count
    return { count: current.count + 1, windowStart: current.windowStart };
  });

  // Transaction aborted means rate limited
  return result.committed;
}

/**
 * Generate a signed URL for Bunny.net CDN
 * @param {string} path - File path (e.g., "/audio/ocean-waves.mp3") - can be URL-encoded
 * @param {number} expirationSeconds - How long the URL is valid
 * @returns {object} - { signedUrl, expires }
 */
function generateSignedUrl(path, expirationSeconds = URL_EXPIRATION_SECONDS) {
  // Calculate expiration timestamp
  const expires = Math.floor(Date.now() / 1000) + expirationSeconds;

  // Bunny.net requires the DECODED path for hash computation
  const decodedPath = decodeURIComponent(path);

  // Create hash: md5(secret + decodedPath + expires)
  const hashString = `${BUNNY_SECRET}${decodedPath}${expires}`;
  const hash = crypto.createHash('md5').update(hashString).digest('base64');

  // URL-safe base64 encoding
  const token = hash
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Build signed URL with encoded path
  const encodedPath = encodeURI(decodedPath);
  const signedUrl = `${BUNNY_CDN_URL}${encodedPath}?token=${token}&expires=${expires}`;

  return { signedUrl, expires };
}

/**
 * Cloud Function: Get signed download URL for an asset
 * Called from the React Native app
 */
exports.getSignedUrl = functions.https.onCall(async (data, context) => {
  const { assetId, assetType, verificationCode, filePath } = data;

  // 1. Validate input
  if (!assetType || !verificationCode) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Missing required parameters: assetType, verificationCode'
    );
  }

  if (!assetId && !filePath) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Either assetId or filePath must be provided'
    );
  }

  // 2. Check rate limit
  const allowed = await checkRateLimit(verificationCode);
  if (!allowed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Rate limit exceeded. Please wait a moment before trying again.'
    );
  }

  try {
    // 3. Verify user exists and has quota
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

    // 4. Build file path
    let path;
    if (filePath) {
      // Use provided file path (for audio streaming with full CDN structure)
      path = filePath;
    } else if (assetType === 'audio') {
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

    // 5. Generate signed URL
    const { signedUrl, expires } = generateSignedUrl(path);

    // 6. Log request (optional - for monitoring)
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

  // 2. Check rate limit
  const allowed = await checkRateLimit(verificationCode);
  if (!allowed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Rate limit exceeded. Please wait a moment before trying again.'
    );
  }

  try {
    // 3. Verify user exists and has quota
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

    // 4. Generate signed URLs for all assets
    const results = assets.map(({ assetId, assetType, filePath }) => {
      let path;
      if (filePath) {
        // Use provided file path (for thumbnails/audio with full CDN structure)
        path = filePath;
      } else if (assetType === 'audio') {
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
