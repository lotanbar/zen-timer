# Bunny.net CDN Setup with Token Authentication

This guide explains how to configure Bunny.net to use signed URLs with token authentication.

## Why Token Authentication?

**Without token authentication:**
- Users can share CDN URLs with anyone → Free access for everyone
- Old URLs never expire → Users can access files even after quota runs out
- Direct browser access → Bypasses your app entirely

**With token authentication:**
- URLs expire after 1 hour → No permanent access
- Invalid/expired tokens = 403 Forbidden → Secure downloads
- Users must request new URLs through your app → Full control

## Step-by-Step Setup

### 1. Login to Bunny.net Dashboard

Go to: https://dash.bunny.net

### 2. Navigate to Your Pull Zone

- Click **Storage** → **Pull Zones**
- Select your Pull Zone (e.g., `zen-timer`)

### 3. Enable Token Authentication

1. Click the **Security** tab
2. Scroll to **Token Authentication**
3. Toggle **Enable Token Authentication** to ON
4. Click **Generate Token Key** (or use existing)
5. **IMPORTANT:** Copy the token key: `267a4c7a-f95a-41e4-8b9a-8249ed065e5c`

### 4. Configure Token Settings

Keep these settings:

- **Parameter Name:** `token` (default)
- **Expiration Parameter:** `expires` (optional but recommended)
- **Include Client IP:** ❌ OFF (users might switch networks during download)
- **Allowed Referrers:** Leave empty (React Native doesn't send referrer)

### 5. Save Settings

Click **Save** at the bottom of the page.

### 6. Verify CDN URL

Make note of your CDN URL (shown at the top):
```
https://zen-timer.b-cdn.net
```

Update this in `functions/index.js`:
```javascript
const BUNNY_CDN_URL = 'https://zen-timer.b-cdn.net';
```

## Testing Token Authentication

### Test 1: Direct Access (Should Fail)

Try accessing a file directly in your browser:
```
https://zen-timer.b-cdn.net/audio/ocean-waves.mp3
```

**Expected:** `403 Forbidden` or authentication error

### Test 2: Signed URL (Should Work)

Generate a test signed URL using this tool:

**Hash String:**
```
md5("267a4c7a-f95a-41e4-8b9a-8249ed065e5c" + "/audio/ocean-waves.mp3" + "EXPIRES_TIMESTAMP")
```

**Example:** https://www.md5hashgenerator.com/

Then access:
```
https://zen-timer.b-cdn.net/audio/ocean-waves.mp3?token=HASH&expires=TIMESTAMP
```

**Expected:** File downloads successfully

## File Structure on Bunny.net

Ensure your files are organized as:

```
/audio/
  ocean-waves.mp3
  forest-rain.mp3
  tibetan-bowls.mp3
  ...

/images/
  ocean-waves.jpg
  forest-rain.jpg
  bell-temple.png
  ...
```

The Cloud Function expects this structure when generating paths.

## CORS Configuration

If you encounter CORS errors:

1. Go to **Pull Zone** → **General** tab
2. Scroll to **CORS Configuration**
3. Add to **Allowed Origins:**
   ```
   *
   ```
   (Or your specific app domain if available)

4. Save settings

## Monitoring & Analytics

### View Download Statistics

- **Pull Zone** → **Statistics**
- Monitor bandwidth usage
- Compare: Total Quota Charged vs. Total CDN Bandwidth

**If quota charged > CDN bandwidth** → Users are copying files manually (you're saving money!)

### View Access Logs

- Enable logging in **Pull Zone** → **Logging**
- Check for 403 errors (failed authentication attempts)
- Monitor which files are most downloaded

## Troubleshooting

### Issue: "403 Forbidden" on valid signed URL

**Solution:**
- Verify token authentication key matches in Bunny.net and `functions/index.js`
- Check expires timestamp is in the future
- Ensure file path matches exactly (case-sensitive)

### Issue: "Token parameter is missing"

**Solution:**
- Verify "Parameter Name" is set to `token` in Bunny.net
- Check signed URL includes `?token=xxx&expires=xxx`

### Issue: Files accessible without token

**Solution:**
- Verify "Enable Token Authentication" is toggled ON
- Wait 60 seconds for CDN cache to clear
- Try accessing from different browser/incognito mode

## Cost Optimization

With token authentication + quota system:

1. **You save bandwidth** when users copy files manually between devices
2. **You prevent abuse** by limiting URL lifetime
3. **You maintain control** over who can download

**Expected savings:** 20-40% reduction in CDN bandwidth (users sharing files with themselves)

## Security Best Practices

✅ **DO:**
- Keep token authentication key secret
- Store key only in Firebase Cloud Functions
- Monitor 403 errors for abuse attempts
- Set reasonable expiration (1 hour is good)

❌ **DON'T:**
- Expose token key in React Native app
- Use permanent (non-expiring) URLs
- Disable token authentication after enabling
- Share token key publicly

## Next Steps

1. ✅ Enable token authentication in Bunny.net
2. ✅ Update `BUNNY_CDN_URL` in `functions/index.js`
3. ✅ Deploy Firebase Functions: `firebase deploy --only functions`
4. ✅ Test downloading in the app
5. ✅ Monitor bandwidth usage

---

**Need help?** Check Bunny.net docs: https://docs.bunny.net/docs/stream-security-token-authentication
