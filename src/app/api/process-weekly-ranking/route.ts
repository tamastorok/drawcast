import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/firebase-admin';

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

export async function POST() {
  try {
    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    
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

    // Create a batch for all updates
    const batch = adminDb.batch();

    try {
      // Update the top user's weeklyWins count
      const topUserRef = adminDb.collection('users').doc(topUser.id);
      batch.update(topUserRef, {
        weeklyWins: (topUser.weeklyWins || 0) + 1,
        weeklyPoints: 0 // Reset weekly points
      });

      // Update top drawer if exists
      if (topDrawer && (topDrawer.weeklyGameSolutions ?? 0) > 0) {
        const topDrawerRef = adminDb.collection('users').doc(topDrawer.id);
        batch.update(topDrawerRef, {
          weeklyTopDrawer: (topDrawer.weeklyTopDrawer || 0) + 1,
          weeklyGameSolutions: 0
        });
      }

      // Update top guesser if exists
      if (topGuesser && (topGuesser.weeklyCorrectGuesses ?? 0) > 0) {
        const topGuesserRef = adminDb.collection('users').doc(topGuesser.id);
        batch.update(topGuesserRef, {
          weeklyTopGuesser: (topGuesser.weeklyTopGuesser || 0) + 1,
          weeklyCorrectGuesses: 0
        });
      }

      // Reset weekly points and stats for all users
      users.forEach(user => {
        const userRef = adminDb.collection('users').doc(user.id);
        batch.update(userRef, { 
          weeklyPoints: 0,
          weeklyGameSolutions: 0,
          weeklyCorrectGuesses: 0
        });
      });

      console.log('Committing batch updates...');
      // Commit all updates
      await batch.commit();
      console.log('Batch updates committed successfully');

    } catch (batchError: unknown) {
      console.error('Error during batch operations:', batchError);
      const error = batchError as Error;
      throw new Error(`Batch operation failed: ${error.message}`);
    }

    return NextResponse.json({
      message: 'Weekly ranking processed successfully',
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
    // Return more detailed error information
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