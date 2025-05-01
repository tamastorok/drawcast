import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const apps = getApps();

if (!apps.length) {
  try {
    // Clean and format the private key
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      // Remove any surrounding quotes
      privateKey = privateKey.replace(/^"|"$/g, '');
      // Replace escaped newlines with actual newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
      // Ensure the key starts and ends with the correct markers
      if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
        privateKey = '-----BEGIN PRIVATE KEY-----\n' + privateKey;
      }
      if (!privateKey.endsWith('-----END PRIVATE KEY-----')) {
        privateKey = privateKey + '\n-----END PRIVATE KEY-----';
      }
    }

    // Set NODE_TLS_REJECT_UNAUTHORIZED environment variable
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      })
    });

    // Reset NODE_TLS_REJECT_UNAUTHORIZED after initialization
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    throw error;
  }
}

export const adminDb = getFirestore(); 