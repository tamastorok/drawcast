import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Configure longer timeout for this route
export const maxDuration = 300; // 5 minutes

interface UserData {
  id: string;
  username?: string;
  weeklyPoints: number;
  weeklyWins?: number;
  points?: number;
  created?: number;
  gameSolutions?: number;
  correctGuesses?: number;
  streak?: number;
  streakPoints?: number;
  isEarlyAdopter?: boolean;
  isCoined?: boolean;
  weeklyGameSolutions?: number;
  weeklyCorrectGuesses?: number;
  weeklyTopDrawer?: number;
  weeklyTopGuesser?: number;
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
    console.log('Starting weekly ranking process...');
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
    
    // Create array of users with their weekly stats
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      weeklyPoints: doc.data().weeklyPoints || 0,
      weeklyGameSolutions: doc.data().weeklyGameSolutions || 0,
      weeklyCorrectGuesses: doc.data().weeklyCorrectGuesses || 0
    })) as UserData[];

    console.log(`Processing ${users.length} users for weekly ranking`);

    // Sort users by different criteria
    const sortedByPoints = [...users].sort((a, b) => b.weeklyPoints - a.weeklyPoints);
    const sortedBySolutions = [...users].sort((a, b) => (b.weeklyGameSolutions || 0) - (a.weeklyGameSolutions || 0));
    const sortedByGuesses = [...users].sort((a, b) => (b.weeklyCorrectGuesses || 0) - (a.weeklyCorrectGuesses || 0));

    // Get the top users
    const topUser = sortedByPoints[0];
    const topDrawer = sortedBySolutions[0];
    const topGuesser = sortedByGuesses[0];

    if (!topUser) {
      return NextResponse.json({ message: 'No users found' }, { status: 200 });
    }

    console.log('Top users identified:', {
      topUser: topUser.id,
      topDrawer: topDrawer?.id,
      topGuesser: topGuesser?.id
    });

    // Process updates in chunks to avoid batch size limits
    const BATCH_SIZE = 400; // Leave some room for the top user updates
    const userChunks = chunkArray(users, BATCH_SIZE);
    console.log(`Processing updates in ${userChunks.length} chunks`);

    try {
      // First, handle the special cases (top users)
      const specialBatch = adminDb.batch();
      
      // Update the top user's weeklyWins count
      const topUserRef = adminDb.collection('users').doc(topUser.id);
      specialBatch.update(topUserRef, {
        weeklyWins: (topUser.weeklyWins || 0) + 1,
        weeklyPoints: 0
      });

      // Update top drawer if exists
      if (topDrawer && (topDrawer.weeklyGameSolutions ?? 0) > 0) {
        const topDrawerRef = adminDb.collection('users').doc(topDrawer.id);
        specialBatch.update(topDrawerRef, {
          weeklyTopDrawer: (topDrawer.weeklyTopDrawer || 0) + 1,
          weeklyGameSolutions: 0
        });
      }

      // Update top guesser if exists
      if (topGuesser && (topGuesser.weeklyCorrectGuesses ?? 0) > 0) {
        const topGuesserRef = adminDb.collection('users').doc(topGuesser.id);
        specialBatch.update(topGuesserRef, {
          weeklyTopGuesser: (topGuesser.weeklyTopGuesser || 0) + 1,
          weeklyCorrectGuesses: 0
        });
      }

      console.log('Committing special batch updates...');
      await specialBatch.commit();
      console.log('Special batch updates committed successfully');

      // Then process the regular user updates in chunks
      for (let i = 0; i < userChunks.length; i++) {
        const chunk = userChunks[i];
        const batch = adminDb.batch();
        
        chunk.forEach(user => {
          const userRef = adminDb.collection('users').doc(user.id);
          batch.update(userRef, { 
            weeklyPoints: 0,
            weeklyGameSolutions: 0,
            weeklyCorrectGuesses: 0
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
    console.log(`Weekly ranking process completed in ${(endTime - startTime) / 1000} seconds`);

    return NextResponse.json({
      message: 'Weekly ranking processed successfully',
      processingTime: `${(endTime - startTime) / 1000} seconds`,
      topUser: {
        id: topUser.id,
        username: topUser.username || 'Anonymous',
        weeklyPoints: topUser.weeklyPoints
      },
      topDrawer: topDrawer ? {
        id: topDrawer.id,
        username: topDrawer.username || 'Anonymous',
        weeklyGameSolutions: topDrawer.weeklyGameSolutions
      } : null,
      topGuesser: topGuesser ? {
        id: topGuesser.id,
        username: topGuesser.username || 'Anonymous',
        weeklyCorrectGuesses: topGuesser.weeklyCorrectGuesses
      } : null
    });
  } catch (error: unknown) {
    console.error('Error processing weekly ranking:', error);
    const err = error as Error;
    return NextResponse.json(
      { 
        error: 'Failed to process weekly ranking',
        details: err.message,
        stack: err.stack
      },
      { status: 500 }
    );
  }
} 