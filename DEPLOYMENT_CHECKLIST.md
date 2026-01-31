# Deployment Checklist - Signed URLs & Sync Service

## ✅ Completed

- [x] Firebase Cloud Functions for signed URL generation
- [x] Sync service to prevent storage inconsistencies
- [x] Client-side signed URL integration
- [x] Security documentation
- [x] Bunny.net setup guide

## 🚀 Next Steps (Required Before App Works)

### 1. Install Dependencies

```bash
# Install Firebase Functions package
npm install @react-native-firebase/functions

# Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

### 2. Update Bunny.net CDN URL

Edit `functions/index.js` line 8:

```javascript
const BUNNY_CDN_URL = 'https://zen-timer.b-cdn.net'; // Replace with your actual URL
```

### 3. Enable Bunny.net Token Authentication

Follow the guide: `docs/BUNNY_SETUP.md`

**Quick steps:**
1. Login to https://dash.bunny.net
2. Go to your Pull Zone → **Security** tab
3. Enable **Token Authentication**
4. Verify token key is: `267a4c7a-f95a-41e4-8b9a-8249ed065e5c`
5. Set expiration parameter to: `expires`
6. **Save**

### 4. Deploy Firebase Cloud Functions

```bash
# Login to Firebase (if not already)
firebase login

# Deploy functions
firebase deploy --only functions
```

**Expected output:**
```
✔ functions: Finished running deploy script
✔ functions[getSignedUrl(us-central1)]: Successful create operation
✔ functions[getBatchSignedUrls(us-central1)]: Successful create operation
```

### 5. Test the Implementation

**Test 1: Direct CDN access (should fail)**
```
Open in browser: https://zen-timer.b-cdn.net/audio/ocean-waves.mp3
Expected: 403 Forbidden
```

**Test 2: App download (should work)**
```
1. Open app
2. Select an ambience
3. Click "Start"
4. Download should work with signed URL
```

**Test 3: Sync on startup**
```
1. Close and reopen app
2. Check console logs for: "Running startup sync..."
3. Should sync local files with Firebase
```

### 6. Rebuild and Test App

```bash
# Android
npm run android

# iOS
npm run ios
```

## 📊 Monitoring

### Verify Functions Deployed

```bash
# Check functions list
firebase functions:list

# View logs
firebase functions:log --only getSignedUrl
```

### Bunny.net Dashboard

Monitor at: https://dash.bunny.net

- **Statistics** → Check bandwidth usage
- **Analytics** → Monitor 403 errors (unauthorized access attempts)
- Compare: Quota charged vs CDN bandwidth used

## 🔒 Security Verification

- [ ] Token authentication enabled in Bunny.net
- [ ] Direct CDN URLs return 403 Forbidden
- [ ] Token secret NOT exposed in React Native app
- [ ] URLs expire after 1 hour
- [ ] Users with exceeded quota cannot get new URLs

## 🐛 Troubleshooting

### "Failed to get signed URL"
- Check Firebase Functions are deployed: `firebase functions:list`
- Check function logs: `firebase functions:log`
- Verify user is authenticated in app

### "403 Forbidden" on download
- Verify Bunny.net token authentication is enabled
- Check token key matches in Bunny.net and `functions/index.js`
- Ensure CDN URL is correct in `functions/index.js`

### "Download starts but fails quickly"
- Check quota hasn't been exceeded
- Verify signed URL hasn't expired (1 hour limit)
- Check network connectivity

### Sync not working
- Check console logs for sync errors
- Verify Firebase database rules allow read/write
- Check user authentication status

## 📝 Configuration Files

| File | Purpose | Status |
|------|---------|--------|
| `functions/index.js` | Cloud Functions code | ✅ Created |
| `firebase.json` | Firebase config | ✅ Created |
| `src/services/signedUrlService.ts` | Client-side URL requests | ✅ Created |
| `src/services/syncService.ts` | Local/Firebase sync | ✅ Created |
| `docs/BUNNY_SETUP.md` | Bunny.net setup guide | ✅ Created |

## 🎯 Success Criteria

Your implementation is successful when:

1. ✅ Direct CDN URLs return 403 Forbidden
2. ✅ App downloads work with signed URLs
3. ✅ URLs expire after 1 hour
4. ✅ Sync runs on app startup
5. ✅ Users cannot exceed quota
6. ✅ Old URLs cannot be reused

## 💰 Expected Cost Savings

With this implementation:

- **CDN Bandwidth Reduction:** 20-40% (users sharing files manually)
- **Security:** Prevents URL sharing exploits
- **Control:** Full quota enforcement

**Monitor:** Quota charged should be >= CDN bandwidth used

---

**Questions?** Check the docs:
- Bunny.net Setup: `docs/BUNNY_SETUP.md`
- Functions README: `functions/README.md`
- Firebase Functions Logs: `firebase functions:log`
