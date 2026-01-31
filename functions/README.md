# Firebase Cloud Functions - Signed URL Generation

This directory contains Firebase Cloud Functions for generating signed Bunny.net CDN URLs with 1-hour expiration.

## Setup

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Bunny.net URL

Edit `functions/index.js` and update the CDN URL:

```javascript
const BUNNY_CDN_URL = 'https://zen-timer.b-cdn.net'; // Your actual CDN URL
```

### 3. Deploy Functions

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy functions
firebase deploy --only functions
```

## Functions

### `getSignedUrl`

Generates a signed URL for a single asset.

**Request:**
```javascript
{
  assetId: "ocean-waves",
  assetType: "audio", // or "image"
  verificationCode: "ABC123"
}
```

**Response:**
```javascript
{
  signedUrl: "https://zen-timer.b-cdn.net/audio/ocean-waves.mp3?token=xxx&expires=1234567890",
  expires: 1234567890,
  expiresIn: 3600
}
```

### `getBatchSignedUrls`

Generates signed URLs for multiple assets (max 50).

**Request:**
```javascript
{
  assets: [
    { assetId: "ocean-waves", assetType: "audio" },
    { assetId: "forest-rain", assetType: "audio" }
  ],
  verificationCode: "ABC123"
}
```

**Response:**
```javascript
{
  urls: [
    {
      assetId: "ocean-waves",
      assetType: "audio",
      signedUrl: "https://...",
      expires: 1234567890
    },
    // ...
  ],
  expiresIn: 3600
}
```

## Security

- **Token Secret:** The Bunny.net token authentication key is stored in `index.js` (not exposed to clients)
- **User Validation:** Functions verify user exists and has quota before generating URLs
- **Expiration:** URLs expire after 1 hour (3600 seconds)
- **Quota Check:** Users with exceeded quota cannot get new URLs

## Testing Locally

```bash
# Start Firebase emulator
npm run serve

# Functions will be available at:
# http://localhost:5001/YOUR-PROJECT-ID/us-central1/getSignedUrl
```

## Monitoring

View function logs:
```bash
firebase functions:log
```

Or check Firebase Console → Functions → Logs

## Bunny.net Configuration

**IMPORTANT:** Token authentication must be enabled in Bunny.net for signed URLs to work.

See: `/docs/BUNNY_SETUP.md` for complete setup instructions.
