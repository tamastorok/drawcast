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
}

export async function POST() {
  try {
    // Get all users
    const usersSnapshot = await adminDb.collection('users').get();
    
    // Create array of users with their weekly points
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      weeklyPoints: doc.data().weeklyPoints || 0
    })) as UserData[];

    // Sort users by weekly points in descending order
    const sortedUsers = users.sort((a, b) => b.weeklyPoints - a.weeklyPoints);

    // Get the top user
    const topUser = sortedUsers[0];

    if (!topUser) {
      return NextResponse.json({ message: 'No users found' }, { status: 200 });
    }

    // Create a batch for all updates
    const batch = adminDb.batch();

    // Update the top user's weeklyWins count
    const topUserRef = adminDb.collection('users').doc(topUser.id);
    batch.update(topUserRef, {
      weeklyWins: (topUser.weeklyWins || 0) + 1,
      weeklyPoints: 0 // Reset weekly points
    });

    // Reset weekly points for all users
    users.forEach(user => {
      const userRef = adminDb.collection('users').doc(user.id);
      batch.update(userRef, { weeklyPoints: 0 });
    });

    // Commit all updates
    await batch.commit();

    return NextResponse.json({
      message: 'Weekly ranking processed successfully',
      topUser: {
        id: topUser.id,
        username: topUser.username || 'Anonymous',
        weeklyPoints: topUser.weeklyPoints
      }
    });
  } catch (error) {
    console.error('Error processing weekly ranking:', error);
    return NextResponse.json(
      { error: 'Failed to process weekly ranking' },
      { status: 500 }
    );
  }
} 