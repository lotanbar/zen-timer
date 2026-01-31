# 🚀 Final Deployment Steps

## ✅ What's Already Done

- [x] Firebase Cloud Functions created
- [x] Sync service implemented
- [x] Signed URL integration complete
- [x] CDN URL configured: `zentimer-assets.b-cdn.net`
- [x] Firebase project configured: `zen-timer-7764e`
- [x] Database rules created
- [x] All dependencies installed
- [x] Bunny.net token authentication enabled (you confirmed)

## 🎯 What You Need to Do NOW

### Run This ONE Command:

```bash
./deploy.sh
```

**This will:**
1. Open your browser to login to Firebase (use your Google account)
2. Deploy the Cloud Functions automatically
3. Show you the deployment status

**Expected output:**
```
✔ functions: Finished running deploy script
✔ functions[getSignedUrl(us-central1)]: Successful create operation
✔ functions[getBatchSignedUrls(us-central1)]: Successful create operation
```

### If Deploy Script Doesn't Work:

Run these manually:

```bash
# 1. Login (opens browser)
npx firebase login

# 2. Deploy functions
npx firebase deploy --only functions
```

## 🧪 Testing After Deployment

### Test 1: Verify Functions Are Live

```bash
npx firebase functions:list
```

**Expected:**
```
✔ getSignedUrl (us-central1)
✔ getBatchSignedUrls (us-central1)
```

### Test 2: Test Direct CDN Access (Should Fail)

Open in browser:
```
https://zentimer-assets.b-cdn.net/audio/ocean-waves.mp3
```

**Expected:** `403 Forbidden` or "Authentication Required"

### Test 3: Build and Run App

```bash
npm run android
```

**Expected:**
- App opens normally
- Sync runs on startup (check console logs)
- Downloads work with signed URLs
- No 403 errors in app

### Test 4: Check Function Logs

```bash
npx firebase functions:log --only getSignedUrl
```

**Expected:** Should see log entries when app requests signed URLs

## 🎉 Success Criteria

Your deployment is successful when:

- ✅ Functions show in `firebase functions:list`
- ✅ Direct CDN URLs return 403 Forbidden
- ✅ App downloads work normally
- ✅ Sync runs on app startup
- ✅ Function logs show signed URL requests

## 🔧 Troubleshooting

### "Error: Failed to authenticate"

**Solution:** Run `npx firebase login --reauth`

### "Error: Permission denied"

**Solution:**
1. Go to Firebase Console
2. Settings → Users and Permissions
3. Make sure your account has "Editor" or "Owner" role

### Functions Deploy But Don't Work

**Solution:**
1. Check function logs: `npx firebase functions:log`
2. Verify Bunny.net token auth is enabled
3. Check CDN URL in `functions/index.js` is correct

### App Shows "Failed to get signed URL"

**Solution:**
1. Verify functions deployed: `npx firebase functions:list`
2. Check quota isn't exceeded
3. Check user is authenticated in app

## 📊 Monitoring

After deployment, monitor:

1. **Function Invocations:** Firebase Console → Functions → Usage
2. **CDN Bandwidth:** Bunny.net Dashboard → Statistics
3. **Quota Usage:** Firebase Realtime Database → Data → users

## 💰 Cost Tracking

**Expected costs:**
- Firebase Functions: Free tier covers ~125,000 invocations/month
- Bunny.net: ~20-40% reduction in bandwidth (users copying files)

**Monitor:** Quota charged should be >= CDN bandwidth used

## 🎊 You're Almost Done!

Just run: `./deploy.sh`

Then rebuild the app and test!

---

**Questions?** Check the logs:
- Function logs: `npx firebase functions:log`
- App logs: `npx react-native log-android`
