import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Configure longer timeout for this route
export const maxDuration = 300; // 5 minutes

interface UserData {
  id: string;
  username?: string;
  dailyGamesCreated: number;
  dailyShared: number;
  dailyCorrectGuesses: number;
  isDailyQuestCompleted: boolean;
}

// Helper function to chunk array into smaller pieces
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export async function POST(request: Request) {
  try {
    console.log('Starting daily quest reset process...');
    const startTime = Date.now();

    // Get Firebase credentials from headers
    const projectId = request.headers.get('x-firebase-project-id');
    const clientEmail = request.headers.get('x-firebase-client-email');
    const privateKey = request.headers.get('x-firebase-private-key');

    console.log('Firebase credentials check:', {
      hasProjectId: !!projectId,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKey
    });

    // Check if all required credentials are present
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Missing required Firebase credentials in headers');
    }

    // Initialize Firebase Admin with credentials from headers
    if (!getApps().length) {
      try {
        console.log('Initializing Firebase Admin with credentials from headers...');
        
        // Clean and format the private key
        let formattedPrivateKey = privateKey;
        // Remove any surrounding quotes
        formattedPrivateKey = formattedPrivateKey.replace(/^"|"$/g, '');
        // Replace escaped newlines with actual newlines
        formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');
        // Ensure the key starts and ends with the correct markers
        if (!formattedPrivateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
          formattedPrivateKey = '-----BEGIN PRIVATE KEY-----\n' + formattedPrivateKey;
        }
        if (!formattedPrivateKey.endsWith('-----END PRIVATE KEY-----')) {
          formattedPrivateKey = formattedPrivateKey + '\n-----END PRIVATE KEY-----';
        }

        // Set NODE_TLS_REJECT_UNAUTHORIZED environment variable
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
          })
        });

        // Reset NODE_TLS_REJECT_UNAUTHORIZED after initialization
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
        console.log('Firebase Admin initialized successfully');
      } catch (error) {
        console.error('Error initializing Firebase Admin:', error);
        throw error;
      }
    }

    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    console.log(`Retrieved ${usersSnapshot.size} users from database`);
    
    // Create array of users with their daily stats
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      dailyGamesCreated: doc.data().dailyGamesCreated || 0,
      dailyShared: doc.data().dailyShared || 0,
      dailyCorrectGuesses: doc.data().dailyCorrectGuesses || 0,
      isDailyQuestCompleted: doc.data().isDailyQuestCompleted || false
    })) as UserData[];

    console.log(`Processing ${users.length} users for daily quest reset`);

    // Process updates in chunks to avoid batch size limits
    const BATCH_SIZE = 400;
    const userChunks = chunkArray(users, BATCH_SIZE);
    console.log(`Processing updates in ${userChunks.length} chunks`);

    try {
      // Process all user updates in chunks
      for (let i = 0; i < userChunks.length; i++) {
        const chunk = userChunks[i];
        const batch = adminDb.batch();
        
        chunk.forEach(user => {
          const userRef = adminDb.collection('users').doc(user.id);
          batch.update(userRef, { 
            dailyGamesCreated: 0,
            dailyShared: 0,
            dailyCorrectGuesses: 0,
            isDailyQuestCompleted: false,
            isFriendNotificationSent: false
          });
        });

        console.log(`Committing batch ${i + 1}/${userChunks.length}...`);
        await batch.commit();
        console.log(`Batch ${i + 1}/${userChunks.length} committed successfully`);
      }

    } catch (batchError: unknown) {
      console.error('Error during batch operations:', batchError);
      const error = batchError as Error;
      throw new Error(`Batch operation failed: ${error.message}`);
    }

    const endTime = Date.now();
    console.log(`Daily quest reset process completed in ${(endTime - startTime) / 1000} seconds`);

    return NextResponse.json({
      message: 'Daily quest reset processed successfully',
      processingTime: `${(endTime - startTime) / 1000} seconds`,
      usersProcessed: users.length
    });
  } catch (error: unknown) {
    console.error('Error processing daily quest reset:', error);
    const err = error as Error;
    return NextResponse.json(
      { 
        error: 'Failed to process daily quest reset',
        details: err.message,
        stack: err.stack
      },
      { status: 500 }
    );
  }
}