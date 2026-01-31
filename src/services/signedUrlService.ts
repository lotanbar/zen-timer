import functions from '@react-native-firebase/functions';

export interface SignedUrlResponse {
  signedUrl: string;
  expires: number;
  expiresIn: number;
}

export interface BatchSignedUrlRequest {
  assetId: string;
  assetType: 'audio' | 'image';
}

export interface BatchSignedUrlResponse {
  urls: Array<{
    assetId: string;
    assetType: string;
    signedUrl: string;
    expires: number;
    error?: string;
  }>;
  expiresIn: number;
}

/**
 * Get a signed URL for a single asset from Bunny.net CDN
 * URL expires after 1 hour
 */
export async function getSignedUrl(
  assetId: string,
  assetType: 'audio' | 'image',
  verificationCode: string
): Promise<string> {
  try {
    const callable = functions().httpsCallable('getSignedUrl');
    const result = await callable({
      assetId,
      assetType,
      verificationCode,
    });

    const data = result.data as SignedUrlResponse;
    return data.signedUrl;
  } catch (error: any) {
    console.error('Failed to get signed URL:', error);

    // Handle specific Firebase Function errors
    if (error.code === 'functions/permission-denied') {
      throw new Error('Quota exceeded. Cannot download more files.');
    } else if (error.code === 'functions/not-found') {
      throw new Error('User not found. Please verify your account.');
    } else if (error.code === 'functions/invalid-argument') {
      throw new Error('Invalid request parameters.');
    }

    throw new Error('Failed to get download URL. Please try again.');
  }
}

/**
 * Get signed URLs for multiple assets in a single request
 * More efficient than calling getSignedUrl multiple times
 */
export async function getBatchSignedUrls(
  assets: BatchSignedUrlRequest[],
  verificationCode: string
): Promise<BatchSignedUrlResponse> {
  try {
    const callable = functions().httpsCallable('getBatchSignedUrls');
    const result = await callable({
      assets,
      verificationCode,
    });

    return result.data as BatchSignedUrlResponse;
  } catch (error: any) {
    console.error('Failed to get batch signed URLs:', error);

    if (error.code === 'functions/permission-denied') {
      throw new Error('Quota exceeded. Cannot download more files.');
    } else if (error.code === 'functions/not-found') {
      throw new Error('User not found. Please verify your account.');
    }

    throw new Error('Failed to get download URLs. Please try again.');
  }
}
