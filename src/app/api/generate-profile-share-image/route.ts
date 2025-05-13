import { NextResponse } from 'next/server';
import { createCanvas, loadImage } from 'canvas';
import { initializeApp as initializeAdminApp, getApps, cert } from 'firebase-admin/app';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';

// Initialize Firebase Admin if it hasn't been initialized
if (!getApps().length) {
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID is not set');
  }
  if (!process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('FIREBASE_CLIENT_EMAIL is not set');
  }
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('FIREBASE_PRIVATE_KEY is not set');
  }
  if (!process.env.FIREBASE_STORAGE_BUCKET) {
    throw new Error('FIREBASE_STORAGE_BUCKET is not set');
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  
  initializeAdminApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const adminDb = getFirestore();
const adminStorage = getAdminStorage();

async function generateProfileShareImage(
  userId: string, 
  providedStats?: {
    level?: number;
    levelName?: string;
    isPremium?: boolean;
    correctGuesses?: number;
    gameSolutions?: number;
    pointsRank?: number | null;
    drawersRank?: number | null;
    guessersRank?: number | null;
  }
) {
  // Fetch user data from Firestore
  const userRef = adminDb.collection('users').doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data();
  
  // Ensure we have all the required rank data, using provided stats if available
  const userRanks = {
    pointsRank: providedStats?.pointsRank ?? userData?.pointsRank ?? null,
    drawersRank: providedStats?.drawersRank ?? userData?.drawersRank ?? null,
    guessersRank: providedStats?.guessersRank ?? userData?.guessersRank ?? null,
    points: userData?.points || 0,
    username: userData?.username || `@${userId}`,
    pfpUrl: userData?.pfpUrl || `https://warpcast.com/${userId}/pfp`,
    isEarlyAdopter: userData?.isEarlyAdopter || false,
    isCoined: userData?.isCoined || false,
    isPremium: providedStats?.isPremium ?? userData?.isPremium ?? false,
    weeklyWins: userData?.weeklyWins || 0,
    weeklyTopDrawer: userData?.weeklyTopDrawer || 0,
    weeklyTopGuesser: userData?.weeklyTopGuesser || 0,
    correctGuesses: providedStats?.correctGuesses ?? userData?.correctGuesses ?? 0,
    gameSolutions: providedStats?.gameSolutions ?? userData?.gameSolutions ?? 0
  };

  // Create canvas
  const canvas = createCanvas(1200, 800);
  const ctx = canvas.getContext('2d');

  // Load and draw background image
  const backgroundPath = path.join(process.cwd(), 'public', 'profileShareBlank3.png');
  const background = await loadImage(backgroundPath);
  ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  
  // Load and draw profile picture
  const pfpUrl = userRanks.pfpUrl;
  const pfp = await loadImage(pfpUrl);
  
  // Draw circular profile picture with dashed border in the top box
  const pfpSize = 150;
  const pfpX = 525;
  const pfpY = 80;
  
  // Draw profile picture
  ctx.save();
  ctx.beginPath();
  ctx.arc(pfpX + pfpSize/2, pfpY + pfpSize/2, pfpSize/2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(pfp, pfpX, pfpY, pfpSize, pfpSize);
  ctx.restore();

  // Draw username
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = '#4B5563';
  ctx.textAlign = 'center';
  ctx.fillText(userRanks.username, canvas.width / 2, pfpY + pfpSize + 15);

  // Draw level info
  const level = providedStats?.level;
  const levelName = providedStats?.levelName;
  if (level && levelName) {
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#4B5563'; // gray-600
    ctx.fillText(`Level ${level}: ${levelName}`, canvas.width / 2, pfpY + pfpSize + 75);
  }

  // Draw badges
  const badgesY = pfpY + pfpSize + 120;
  const badgeSize = 50;
  const badgeSpacing = 30;
  
  // Define badges with their conditions
  const badges = [
    { name: 'OG', isUnlocked: userRanks.isEarlyAdopter, image: 'OGbadge.png' },
    { name: 'Coin', isUnlocked: userRanks.isCoined, image: 'coinerbadge.png' },
    { name: 'Premium', isUnlocked: userRanks.isPremium, image: 'Premium.png' },
    { name: 'Winner', isUnlocked: userRanks.weeklyWins > 0, image: 'weeklyTop.png' },
    { name: 'Drawer', isUnlocked: userRanks.weeklyTopDrawer > 0, image: 'topDrawer.png' },
    { name: 'Guesser', isUnlocked: userRanks.weeklyTopGuesser > 0, image: 'topGuesser.png' }
  ];

  // Filter unlocked badges
  const unlockedBadges = badges.filter(badge => badge.isUnlocked);
  
  // Calculate total width of all badges including spacing
  const totalBadgesWidth = (badgeSize * unlockedBadges.length) + (badgeSpacing * (unlockedBadges.length - 1));
  // Calculate starting X position to center the badges
  let currentX = (canvas.width - totalBadgesWidth) / 2;

  // Helper function to draw a badge
  const drawBadge = async (x: number, y: number, badgeName: string, isUnlocked: boolean, imagePath: string) => {
    // Draw badge background
    ctx.fillStyle = '#f9f7f0';
    ctx.beginPath();
    ctx.arc(x + badgeSize/2, y + badgeSize/2, badgeSize/2 + 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw dashed border
    ctx.strokeStyle = isUnlocked ? '#9CA3AF' : '#D1D5DB';
    ctx.lineWidth = 4;
    ctx.setLineDash([5, 3]);
    ctx.stroke();

    // Load and draw badge image
    try {
      const badgePath = path.join(process.cwd(), 'public', imagePath);
      const badgeImage = await loadImage(badgePath);
      
      // Draw badge image
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + badgeSize/2, y + badgeSize/2, badgeSize/2 - 4, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      
      if (!isUnlocked) {
        // Apply grayscale effect by adjusting the image data
        const imageData = ctx.getImageData(x, y, badgeSize, badgeSize);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg;     // red
          data[i + 1] = avg; // green
          data[i + 2] = avg; // blue
        }
        ctx.putImageData(imageData, x, y);
        ctx.globalAlpha = 0.5;
      }
      
      ctx.drawImage(badgeImage, x, y, badgeSize, badgeSize);
      ctx.restore();
    } catch (error) {
      console.error(`Error loading badge image ${imagePath}:`, error);
    }

    // Draw badge label
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#f9f7f0';
    ctx.textAlign = 'center';
    ctx.fillText(badgeName, x + badgeSize/2, y + badgeSize + 25);
  };

  // Draw only unlocked badges
  for (const badge of unlockedBadges) {
    await drawBadge(currentX, badgesY, badge.name, true, badge.image);
    currentX += badgeSize + badgeSpacing;
  }

  // Update stats Y position to account for badges
  const statsY = badgesY + badgeSize + 90;

  // 3x3 grid layout for stats
  const gridCellWidth = 180;
  const gridCellHeight = 80;
  const gridSpacingX = 150;
  const gridSpacingY = 85;
  const totalGridWidth = 3 * gridCellWidth + 2 * gridSpacingX;
  const gridStartX = (canvas.width - totalGridWidth) / 2;
  const gridStartY = statsY;

  // Define X positions for columns and Y positions for rows
  const colX = [
    gridStartX,
    gridStartX + gridCellWidth + gridSpacingX,
    gridStartX + 2 * (gridCellWidth + gridSpacingX)
  ];
  const rowY = [
    gridStartY,
    gridStartY + gridCellHeight + gridSpacingY
  ];

  // Helper function to draw a stat box (now just draws text)
  function drawStatBox(label: string, value: string | number, x: number, y: number, rotation: number) {
    ctx.save();
    // Rotate the text
    ctx.translate(x + gridCellWidth/2, y + gridCellHeight/2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.translate(-(x + gridCellWidth/2), -(y + gridCellHeight/2));
    // Draw value
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#1F2937'; // gray-800
    ctx.textAlign = 'center';
    ctx.fillText(value.toString(), x + gridCellWidth/2, y + gridCellHeight/2 - 10);
    // Draw label
    ctx.font = '20px Arial';
    ctx.fillStyle = '#4B5563'; // gray-600
    ctx.fillText(label, x + gridCellWidth/2, y + gridCellHeight/2 + 25);
    ctx.restore();
  }

  // Top row
  const overallRank = userRanks.pointsRank ? `#${userRanks.pointsRank}` : '-';
  const drawerRank = userRanks.drawersRank ? `#${userRanks.drawersRank}` : '-';
  const guesserRank = userRanks.guessersRank ? `#${userRanks.guessersRank}` : '-';

  drawStatBox('Overall Rank', overallRank, colX[0], rowY[0], 0);
  drawStatBox('Drawer Rank', drawerRank, colX[1], rowY[0], 0);
  drawStatBox('Guesser Rank', guesserRank, colX[2], rowY[0], 0);

  // Second row
  drawStatBox('Points', userRanks.points, colX[0], rowY[1], 0);
  drawStatBox('Game solutions', userRanks.gameSolutions, colX[1], rowY[1], 0);
  drawStatBox('Correct guesses', userRanks.correctGuesses, colX[2], rowY[1], 0);

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
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media`;
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
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media`;
      return Response.redirect(downloadUrl);
    }
  } catch (error) {
    console.error('Error generating profile share image:', error);
    return new Response('Failed to generate profile share image', { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { 
      userId, 
      level, 
      levelName, 
      isPremium, 
      correctGuesses, 
      gameSolutions,
      pointsRank,
      drawersRank,
      guessersRank 
    } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const imageBuffer = await generateProfileShareImage(userId, {
      level,
      levelName,
      isPremium,
      correctGuesses,
      gameSolutions,
      pointsRank,
      drawersRank,
      guessersRank
    });

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
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media`;

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