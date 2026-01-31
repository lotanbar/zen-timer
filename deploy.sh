#!/bin/bash

echo "🚀 Deploying Firebase Cloud Functions..."
echo ""

# Login to Firebase (opens browser)
echo "Step 1: Authenticating with Firebase..."
npx firebase login

# Deploy functions
echo ""
echo "Step 2: Deploying Cloud Functions..."
npx firebase deploy --only functions

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Verify functions deployed: npx firebase functions:list"
echo "2. Test the app: npm run android"
echo "3. Check logs: npx firebase functions:log"
