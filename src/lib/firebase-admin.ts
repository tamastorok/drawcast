import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const apps = getApps();

if (!apps.length) {
  try {
    console.log('Initializing Firebase Admin...');
    
    // Log environment variable presence (but not values for security)
    console.log('Environment variables check:', {
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY
    });

    // Clean and format the private key
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      console.log('Private key found, formatting...');
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
      console.log('Private key formatted successfully');
    } else {
      console.error('FIREBASE_PRIVATE_KEY is not set');
      throw new Error('FIREBASE_PRIVATE_KEY is not set');
    }

    if (!process.env.FIREBASE_PROJECT_ID) {
      console.error('FIREBASE_PROJECT_ID is not set');
      throw new Error('FIREBASE_PROJECT_ID is not set');
    }

    if (!process.env.FIREBASE_CLIENT_EMAIL) {
      console.error('FIREBASE_CLIENT_EMAIL is not set');
      throw new Error('FIREBASE_CLIENT_EMAIL is not set');
    }

    console.log('Setting up SSL configuration...');
    // Set NODE_TLS_REJECT_UNAUTHORIZED environment variable
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    console.log('Initializing Firebase app...');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      })
    });
    console.log('Firebase app initialized successfully');

    // Reset NODE_TLS_REJECT_UNAUTHORIZED after initialization
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    console.log('SSL configuration reset');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    // Log more details about the error
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}

console.log('Getting Firestore instance...');
export const adminDb = getFirestore();
console.log('Firestore instance created successfully'); 