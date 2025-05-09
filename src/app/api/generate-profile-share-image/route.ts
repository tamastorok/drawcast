import { NextResponse } from 'next/server';
import { createCanvas, loadImage } from 'canvas';
import { initializeApp as initializeAdminApp, getApps, cert } from 'firebase-admin/app';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';

// Initialize Firebase Admin if it hasn't been initialized
if (!getApps().length) {
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    throw new Error('FIREBASE_ADMIN_PROJECT_ID is not set');
  }
  if (!process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
    throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL is not set');
  }
  if (!process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set');
  }
  if (!process.env.FIREBASE_ADMIN_STORAGE_BUCKET) {
    throw new Error('FIREBASE_ADMIN_STORAGE_BUCKET is not set');
  }

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n');
  
  initializeAdminApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
  });
}

const adminDb = getFirestore();
const adminStorage = getAdminStorage();

async function generateProfileShareImage(userId: string) {
  // Fetch user data from Firestore
  const userRef = adminDb.collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data();

  // Create canvas
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // Load background image
  const backgroundPath = path.join(process.cwd(), 'public', 'drawblank.png');
  const background = await loadImage(backgroundPath);
  ctx.drawImage(background, 0, 0, 1200, 630);

  // Load and draw profile picture
  const pfpUrl = userData?.pfpUrl || `https://warpcast.com/${userId}/pfp`;
  const pfp = await loadImage(pfpUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(600, 200, 100, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(pfp, 500, 100, 200, 200);
  ctx.restore();

  // Draw username
  ctx.font = 'bold 48px Arial';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.fillText(userData?.username || `@${userId}`, 600, 350);

  // Draw level info
  const level = Math.floor((userData?.points || 0) / 100) + 1;
  const levelName = getLevelName(level);
  ctx.font = '36px Arial';
  ctx.fillText(`Level ${level}: ${levelName}`, 600, 400);

  // Draw stats
  ctx.font = '24px Arial';
  ctx.fillText(`Overall Rank: #${userData?.pointsRank || 'N/A'}`, 600, 450);
  ctx.fillText(`Points: ${userData?.points || 0}`, 600, 480);
  ctx.fillText(`Day Streaks: ${userData?.streak || 0} 🔥`, 600, 510);
  ctx.fillText(`Drawer Rank: #${userData?.drawersRank || 'N/A'}`, 600, 540);
  ctx.fillText(`Guesser Rank: #${userData?.guessersRank || 'N/A'}`, 600, 570);

  return canvas.toBuffer('image/png');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return new Response('User ID is required', { status: 400 });
    }

    // Check if we already have a stored image
    const bucket = adminStorage.bucket();
    const filename = `shareProfile/${userId}.png`;
    const file = bucket.file(filename);

    try {
      // Try to get the existing file
      await file.getMetadata();
      // If we get here, the file exists, so get its download URL
      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2500'
      });
      return Response.redirect(downloadUrl);
    } catch {
      // File doesn't exist, generate and store it
      const imageBuffer = await generateProfileShareImage(userId);
      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/png',
          metadata: {
            uploadedBy: userId,
            type: 'profileShareImage'
          }
        }
      });

      // Get the download URL
      const [downloadUrl] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2500'
      });
      return Response.redirect(downloadUrl);
    }
  } catch (error) {
    console.error('Error generating profile share image:', error);
    return new Response('Failed to generate profile share image', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const imageBuffer = await generateProfileShareImage(userId);

    // Upload to Firebase Storage in the shareProfile folder
    const bucket = adminStorage.bucket();
    const filename = `shareProfile/${userId}.png`;
    const file = bucket.file(filename);
    
    await file.save(imageBuffer, {
      metadata: {
        contentType: 'image/png',
        metadata: {
          uploadedBy: userId,
          type: 'profileShareImage'
        }
      }
    });

    // Get download URL
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500'
    });

    // Update the user's document with the share image URL
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.update({
      shareImageUrl: downloadUrl
    });

    return NextResponse.json({ shareImageUrl: downloadUrl });
  } catch (error) {
    console.error('Error generating profile share image:', error);
    return NextResponse.json({ 
      error: 'Failed to generate profile share image',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

function getLevelName(level: number): string {
  const levelNames = [
    'Novice Artist',
    'Sketch Enthusiast',
    'Drawing Apprentice',
    'Creative Explorer',
    'Artistic Visionary',
    'Master Doodler',
    'Drawing Virtuoso',
    'Artistic Genius',
    'Drawing Legend',
    'Artistic Mastermind'
  ];
  return levelNames[Math.min(level - 1, levelNames.length - 1)] || 'Drawing Master';
} 