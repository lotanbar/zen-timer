# Resumable Downloads Testing Guide

## Prerequisites

1. **Set up Firebase** - Follow FIREBASE_SETUP.md to create your Firebase project
2. **Add test users** to Firebase with small quotas (e.g., 50MB for easy testing)
3. **Build the app**: `npm run android`

## Test Cases

### Test 1: Normal Download (Complete)

**Goal**: Verify complete downloads work and track quota correctly

**Steps**:
1. Launch app
2. Enter verification code
3. Select an ambience sound (not yet downloaded)
4. Tap "Start"
5. **Expected**:
   - Download progress modal appears
   - Shows MB downloaded / total MB
   - Progress bar fills up
   - Modal closes when complete
   - Meditation screen opens

**Verify**:
- Check Firebase: `quotaUsedMB` increased by file size
- Check Firebase: Asset added to `cachedAssets` array
- Check Firebase: NOT in `partialDownloads`

---

### Test 2: Interrupted Download

**Goal**: Verify partial downloads are tracked correctly

**Steps**:
1. Launch app
2. Select an ambience sound (not yet downloaded)
3. Tap "Start"
4. **While downloading**: Turn off WiFi/mobile data at ~50% progress
5. **Expected**:
   - Alert: "Download interrupted. You've used X.XMB of quota. The download can be resumed later."
   - Progress modal closes
   - Stays on Home screen

**Verify**:
- Check Firebase: `quotaUsedMB` increased by partial MB (roughly half the file size)
- Check Firebase: Asset ID added to `partialDownloads` with MB value
- Check Firebase: Asset NOT in `cachedAssets`
- Check device logs: "Tracked partial download: X.XMB for [asset-id]"

---

### Test 3: Resume Download

**Goal**: Verify interrupted downloads can be resumed

**Steps**:
1. Continue from Test 2 (partial download exists)
2. Turn WiFi/mobile data back on
3. Tap "Start" again with same ambience
4. **Expected**:
   - Download progress modal appears
   - Progress starts from ~50% (where it left off)
   - Downloads remaining bytes
   - Completes successfully

**Verify**:
- Check Firebase: `quotaUsedMB` increased by ~remaining half
- Check Firebase: Asset moved from `partialDownloads` to `cachedAssets`
- Check Firebase: Total quota = original file size (not double-charged)

---

### Test 4: Partial Download Detection on Startup

**Goal**: Verify app detects partial downloads on launch

**Steps**:
1. Create a partial download (see Test 2)
2. **Force close the app** (don't just background it)
3. Relaunch the app
4. **Expected**:
   - Partial download modal appears automatically
   - Shows list of incomplete downloads
   - Shows MB already downloaded and quota used
   - Options: "Continue" or "Delete"

**Verify**:
- Modal shows correct file names and MB values
- Warning shows total MB already used

---

### Test 5: Continue Partial Download

**Goal**: Verify "Continue" option works

**Steps**:
1. See partial download modal (Test 4)
2. Tap "Continue Downloads"
3. Modal closes
4. Select the partial download's ambience
5. Tap "Start"
6. **Expected**:
   - Resumes from where it left off
   - Completes successfully

---

### Test 6: Delete Partial Download

**Goal**: Verify "Delete" option cleans up properly

**Steps**:
1. See partial download modal (Test 4)
2. Tap "Delete Incomplete Files"
3. **Expected**:
   - Modal closes
   - Toast: "Partial downloads deleted"

**Verify**:
- Check Firebase: `partialDownloads` is now empty `{}`
- Check device storage: Partial files removed
- **Important**: `quotaUsedMB` stays the same (no refund!)

---

### Test 7: Quota Exceeded

**Goal**: Verify quota enforcement works

**Steps**:
1. Use a test user with small quota (e.g., 10MB)
2. Download ambience files until quota is exceeded
3. Try to start meditation
4. **Expected**:
   - Alert: "Quota Exceeded. You've used all your bandwidth quota."
   - Meditation blocked

**Verify**:
- Cannot start meditation when `quotaUsedMB >= quotaLimitMB`

---

### Test 8: Cached File Reuse

**Goal**: Verify cached files don't consume additional quota

**Steps**:
1. Download an ambience completely
2. Restart app
3. Select the same ambience
4. Tap "Start"
5. **Expected**:
   - No download progress modal
   - Meditation starts immediately
   - No quota increase

**Verify**:
- Firebase `quotaUsedMB` unchanged
- Device logs: "File exists locally, use it"

---

### Test 9: Cache Cleared (Re-download)

**Goal**: Verify re-downloads after cache clear work correctly

**Steps**:
1. Download ambience (quota: +5MB)
2. Go to Android Settings → Apps → Zen Timer → Storage → Clear Cache
3. Return to app
4. Select same ambience, tap "Start"
5. **Expected**:
   - Downloads again (file was deleted)
   - Quota increases again

**Verify**:
- Firebase `quotaUsedMB` increases by file size again (now +10MB total)
- This is expected behavior (user deleted the file, pays again)

---

### Test 10: Firebase Quota Sync

**Goal**: Verify multiple resume/partial downloads track correctly

**Steps**:
1. Download file 1: Interrupt at 50% (e.g., +2.5MB quota)
2. Download file 2: Interrupt at 30% (e.g., +1.5MB quota)
3. Resume file 1: Complete (e.g., +2.5MB more = 5MB total for file 1)
4. Resume file 2: Complete (e.g., +3.5MB more = 5MB total for file 2)
5. **Expected**:
   - Total quota: 10MB (sum of both files)
   - Both files in `cachedAssets`
   - `partialDownloads` is empty

**Verify**:
- Math adds up correctly
- No double-charging
- All downloads tracked

---

## Developer Testing Tools

### Check Firebase Quota
```
Firebase Console → Realtime Database → users → [code] → quotaUsedMB
```

### Check Device Logs
```bash
npx react-native log-android | grep -E "(partial|download|quota)"
```

### Manually Create Partial Download
1. Start download
2. Kill app process while downloading: `adb shell am force-stop com.allhailalona.ZenTimer`
3. Resume data should be saved

### Reset Quota (for testing)
```
Firebase Console → Set quotaUsedMB = 0
Firebase Console → Set partialDownloads = {}
Firebase Console → Set cachedAssets = []
```

---

## Known Issues to Watch For

1. **Progress jumps to 100% immediately** - Resume data might be corrupt
2. **"Failed to track bandwidth" errors** - Firebase write permission issues
3. **Quota not updating** - Network issues or Firebase rules too restrictive
4. **Download restarts from 0%** - Resume data was lost/deleted

---

## Success Criteria

✅ All test cases pass
✅ Quota matches actual CDN bandwidth consumed
✅ Partial downloads resume correctly
✅ No double-charging for interrupted downloads
✅ Users can't exploit by stopping internet
✅ Firebase `partialDownloads` syncs correctly

---

## Cleanup After Testing

1. Reset test user quotas in Firebase
2. Clear test data: `Firebase Console → Delete test users`
3. Clear app data on device
4. Uninstall test build if needed
