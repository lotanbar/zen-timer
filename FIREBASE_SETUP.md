# Firebase Authentication & Quota Setup Guide

This guide will help you set up Firebase Realtime Database for user authentication and bandwidth quota tracking.

## Why Firebase?

- **Free tier** (1GB storage, 10GB/month bandwidth) - perfect for your use case
- **No credit card required** for free tier
- **No backend deployment** - Firebase handles everything
- **Real-time** quota updates across devices

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `zen-timer` (or whatever you prefer)
4. **Disable** Google Analytics (you don't need it)
5. Click **"Create project"** and wait for it to finish

---

## Step 2: Add Android App to Firebase

1. In your Firebase project, click the **Android icon** (or "Add app")
2. Fill in the form:
   - **Android package name**: `com.allhailalona.ZenTimer`
   - **App nickname**: "Zen Timer" (optional)
   - **Debug signing certificate**: Leave blank for now
3. Click **"Register app"**
4. **Download `google-services.json`** file
5. Move the file to: `/android/app/google-services.json` (replace this path with your actual project path)
6. Click **"Next"** and **"Continue to console"** (skip the SDK setup steps - already done)

---

## Step 3: Enable Realtime Database

1. In Firebase Console, go to **"Build"** > **"Realtime Database"**
2. Click **"Create Database"**
3. Choose location: **United States** (or closest to you)
4. Security rules: Select **"Start in test mode"** for now
5. Click **"Enable"**

---

## Step 4: Set Up Database Rules (Security)

1. In Realtime Database, click the **"Rules"** tab
2. Replace the rules with this:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

3. Click **"Publish"**

**Note:** These rules allow anyone to read/write. Since you're using verification codes as keys, only people with codes can access their data. For production, you'd want stricter rules, but this works for your private app.

---

## Step 5: Add Initial User Data

1. In Realtime Database, click the **"Data"** tab
2. Click the **"+"** icon next to the database URL
3. Add this structure:

```
users (object)
  └─ ABC123 (object)              ← This is Uncle's verification code
       ├─ name: "Uncle Bob"
       ├─ quotaLimitMB: 1000      ← 1GB bandwidth quota
       ├─ quotaUsedMB: 0
       ├─ cachedAssets: []        ← Complete downloads
       └─ partialDownloads: {}    ← Interrupted downloads (auto-managed)
```

**How to add:**
- Click "+" → Name: `users`, leave value empty
- Click "+" on `users` → Name: `ABC123`, leave value empty
- Click "+" on `ABC123` → Name: `name`, Value: `Uncle Bob`
- Click "+" on `ABC123` → Name: `quotaLimitMB`, Value: `1000` (number)
- Click "+" on `ABC123` → Name: `quotaUsedMB`, Value: `0` (number)
- Click "+" on `ABC123` → Name: `cachedAssets`, Type: Array (leave empty)
- Click "+" on `ABC123` → Name: `partialDownloads`, Type: Object (leave empty)

4. Repeat for yourself:

```
  └─ YOUR_CODE (object)           ← Your verification code
       ├─ name: "You"
       ├─ quotaLimitMB: 999999    ← Unlimited for yourself
       ├─ quotaUsedMB: 0
       ├─ cachedAssets: []
       └─ partialDownloads: {}
```

---

## Step 6: Get Your Database URL

1. In Realtime Database, look at the top for the database URL
2. It looks like: `https://zen-timer-xxxxx-default-rtdb.firebaseio.com/`
3. Copy this URL - you'll need it next

---

## Step 7: Update Firebase Config in Code

1. Open `/src/config/firebase.ts`
2. Replace the config with your database URL:

```typescript
export const firebaseConfig = {
  databaseURL: "https://zen-timer-xxxxx-default-rtdb.firebaseio.com/", // ← Your URL here
};
```

---

## Step 8: Rebuild the App

Since you added native Firebase modules, you need to rebuild:

```bash
# Clean and rebuild
cd android
./gradlew clean
cd ..
npm run android
```

**Note:** First build will take longer (downloading Firebase SDK).

---

## Step 9: Test the Authentication

1. Launch the app
2. Tap **"Start"** button (you should see verification modal)
3. Enter the verification code (e.g., `ABC123`)
4. If successful, you'll see the user's name and quota in the header

---

## Managing Users

### Add a New User

Go to Firebase Console > Realtime Database > Data tab:

1. Click "+" on `users` node
2. Name: `NEW_CODE` (e.g., `XYZ789`)
3. Add fields: `name`, `quotaLimitMB`, `quotaUsedMB`, `resetDate`, `cachedAssets`

### Adjust Quota

1. Find the user in the database
2. Click on `quotaLimitMB` and edit the value
3. Or reset `quotaUsedMB` to `0` for a fresh start

### Reset Monthly Quota

You can manually reset quotas each month:

1. For each user, set `quotaUsedMB` to `0`
2. Update `resetDate` to next month

**Future improvement:** You could automate this with a scheduled Firebase Function (requires Blaze plan with credit card).

---

## How It Works

### First Launch
1. User enters verification code
2. App looks up code in Firebase
3. User data saved locally (AsyncStorage)
4. User can meditate

### When Downloading Audio
1. App checks if asset is cached locally
2. If NOT cached: Downloads from Bunny CDN (resumable download)
3. **If download completes**: Tracks file size, updates `quotaUsedMB`, marks as cached
4. **If download interrupted** (network drop):
   - Tracks partial MB downloaded
   - Saves resume data
   - Updates `partialDownloads[assetId] = partialMB`
   - Can resume later from where it left off
5. **If resumed**: Only tracks remaining MB (not already tracked)
6. If CACHED: Uses local file, no quota charged

### When Starting Meditation
1. App refreshes quota from Firebase
2. Checks: `quotaUsedMB < quotaLimitMB`
3. If over quota: Shows error, blocks meditation
4. If under quota: Allows meditation to start

### Quota Display
- Header shows: `Name • RemainingMB / TotalMB`
- Example: `Uncle Bob • 756MB / 1000MB`

---

## Bandwidth Calculation

Your Bunny CDN bills by MB transferred. The app tracks:

### What Counts:
- **Audio files**: First download from CDN (typically 2-10MB per ambience sound)
- **Bell sounds**: First download (typically 50-200KB)
- **Images**: First download (typically 100-500KB)

### What Doesn't Count:
- **Cached files**: After first download, replaying uses $0 bandwidth
- **Bundled assets**: Sounds included in the app don't use CDN

### Example Scenario:
- Uncle downloads ocean ambience (5MB) → Uses 5MB quota
- Uncle meditates with ocean sound again → $0 (cached)
- Uncle downloads rain ambience (4MB) → Uses 4MB quota
- Total: 9MB used of 1000MB quota

### Partial Downloads (Resumable):
**Scenario 1: Interrupted Download**
- Uncle starts downloading ocean (5MB total)
- Network drops at 3MB downloaded
- Quota used: **3MB** (tracks partial download)
- Resume data saved
- Later: Uncle resumes, downloads remaining 2MB
- Additional quota used: **2MB**
- Total: **5MB** (fair - matches actual CDN bandwidth consumed)

**Scenario 2: Exploit Attempt** (why we need this)
- Uncle tries to exploit: Downloads 4.9MB of 5MB, stops internet
- Quota used: **4.9MB** (tracks what was downloaded)
- Uncle clears cache to "reset"
- Uncle downloads again: 5MB
- Total quota used: **9.9MB**
- Result: Uncle wasted own quota, no free access!

---

## Monitoring Bandwidth

### In the App
- Users see their quota in the header
- When quota exceeded, they get an error message

### In Firebase Console
1. Go to Realtime Database > Data tab
2. Expand `users` > `[code]`
3. Check `quotaUsedMB` field

### In Bunny CDN Dashboard
You can verify actual CDN usage:
1. Login to Bunny.net
2. Go to your pull zone
3. Check bandwidth usage stats
4. Should roughly match Firebase quota totals

---

## Troubleshooting

### "Invalid verification code" error
- Check that the code exists in Firebase
- Check spelling/capitalization (codes are case-sensitive)
- Verify internet connection

### Quota not updating
- Check Firebase rules allow writes
- Check internet connection
- Look at React Native logs for errors

### Build errors after setup
- Make sure `google-services.json` is in `/android/app/`
- Clean and rebuild: `cd android && ./gradlew clean && cd .. && npm run android`
- Check that you added the plugin to both `build.gradle` files

### App crashes on startup
- Check Firebase config URL is correct
- Check `google-services.json` package name matches `com.allhailalona.ZenTimer`
- Check React Native logs for Firebase errors

---

## Cost Estimate

### Firebase Free Tier
- **Storage**: 1GB (your database will use ~1KB)
- **Bandwidth**: 10GB/month (quota checks are tiny, ~1KB per check)
- **Connections**: 100 simultaneous (you have 2 users)

**Verdict:** You'll never hit Firebase limits. It's effectively free forever for your use case.

### Bunny CDN Costs
Assuming each user downloads 10 ambience sounds (50MB total):
- 2 users × 50MB = 100MB/month
- Bunny CDN: ~$0.01-0.02/month

**Total monthly cost: Basically free!**

---

## Security Notes

### Why This Approach is Reasonable:
1. **Not public** - Only people with verification codes can use the app
2. **Low stakes** - Worst case: Someone guesses a code and uses some bandwidth
3. **No sensitive data** - Just quotas and preferences
4. **Manual distribution** - You control who gets codes

### For Production (if you expand):
1. Add Firebase Authentication (email/password)
2. Use stricter database rules with auth checks
3. Don't use verification codes as database keys
4. Add server-side quota validation

But for now, this is perfectly fine for you and your uncle!

---

## Next Steps

After setup is complete:

1. **Test thoroughly**: Download various sounds, check quota updates
2. **Monitor Firebase**: Watch the database during testing
3. **Set real quotas**: Decide on monthly MB limits based on actual usage
4. **Create more codes**: Add friends/family as needed
5. **Consider automation**: Maybe write a script to reset quotas monthly

---

## Support

If you run into issues:
1. Check React Native logs: `npx react-native log-android`
2. Check Firebase logs in the console
3. Verify `google-services.json` is in the right place
4. Make sure you're connected to the internet

Good luck! This setup should be painless and cost you essentially nothing.
