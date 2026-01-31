#!/usr/bin/env node

/**
 * Seed test users into Firebase Realtime Database
 *
 * Usage: node scripts/seedUsers.js
 *
 * Creates two test users:
 * 1. Admin user (ADMIN1) - 100GB quota
 * 2. Uncle (UNCLE1) - 500GB quota (~$5 worth at $0.01/GB)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Try to load service account key
let serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Service account key not found!');
  console.error('\nTo get your service account key:');
  console.error('1. Go to Firebase Console → Project Settings');
  console.error('2. Click "Service Accounts" tab');
  console.error('3. Click "Generate new private key"');
  console.error('4. Save as serviceAccountKey.json in project root\n');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Get database URL from .firebaserc
const firebaserc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8'));
const projectId = firebaserc.projects.default;
const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: databaseURL
});

const db = admin.database();

// User data
const users = {
  'ADMIN1': {
    name: 'Admin',
    quotaLimitMB: 102400, // 100 GB
    usedQuotaMB: 0,
    createdAt: Date.now(),
  },
  'UNCLE1': {
    name: 'Uncle',
    quotaLimitMB: 512000, // 500 GB (~$5 at $0.01/GB)
    usedQuotaMB: 0,
    createdAt: Date.now(),
  }
};

async function seedUsers() {
  try {
    console.log('Seeding users to Firebase...\n');

    for (const [code, userData] of Object.entries(users)) {
      const userRef = db.ref(`users/${code}`);

      // Check if user already exists
      const snapshot = await userRef.once('value');
      if (snapshot.exists()) {
        console.log(`⚠️  User ${code} (${userData.name}) already exists, skipping...`);
        continue;
      }

      // Create user
      await userRef.set(userData);
      console.log(`✅ Created user: ${code}`);
      console.log(`   Name: ${userData.name}`);
      console.log(`   Quota: ${(userData.quotaLimitMB / 1024).toFixed(0)} GB`);
      console.log(`   Used: ${userData.usedQuotaMB} MB\n`);
    }

    console.log('✨ Seeding complete!\n');
    console.log('Access codes:');
    console.log('  Admin: ADMIN1');
    console.log('  Uncle: UNCLE1');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
}

seedUsers();
