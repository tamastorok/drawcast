import { NextResponse } from 'next/server';
import { createCanvas, loadImage } from 'canvas';
import { initializeApp as initializeAdminApp, getApps, cert } from 'firebase-admin/app';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

// Debug logging for environment variables
console.log('Environment variables check:');
console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('FIREBASE_PRIVATE_KEY exists:', !!process.env.FIREBASE_PRIVATE_KEY);
console.log('FIREBASE_STORAGE_BUCKET:', process.env.FIREBASE_STORAGE_BUCKET);

// Initialize Firebase Admin if not already initialized
let adminApp;
if (!getApps().length) {
  try {
    console.log('Initializing Firebase Admin...');
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!privateKey) {
      throw new Error('FIREBASE_PRIVATE_KEY is not set');
    }
    
    adminApp = initializeAdminApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    throw error;
  }
} else {
  adminApp = getApps()[0];
}

const adminStorage = getAdminStorage(adminApp);
const adminAuth = getAdminAuth(adminApp);
console.log('Admin Storage and Auth initialized');

export async function POST(request: Request) {
  try {
    console.log('Starting share image generation...');
    const body = await request.json();
    console.log('Received request body:', body);
    
    const { drawingUrl, filename, userId } = body;
    console.log('Extracted data:', { drawingUrl, filename, userId });

    // Verify the user is authenticated
    if (!userId) {
      console.log('Authentication failed: No userId provided in request');
      return NextResponse.json({ error: 'Unauthorized - No userId provided' }, { status: 401 });
    }

    if (typeof userId !== 'string') {
      console.log('Authentication failed: userId is not a string:', typeof userId);
      return NextResponse.json({ error: 'Unauthorized - Invalid userId format' }, { status: 401 });
    }

    if (!userId.match(/^\d+$/)) {
      console.log('Authentication failed: userId is not a valid FID:', userId);
      return NextResponse.json({ error: 'Unauthorized - Invalid FID format' }, { status: 401 });
    }

    // Create a custom token for the user
    try {
      await adminAuth.createCustomToken(userId);
      console.log('Custom token created for user:', userId);
    } catch (authError) {
      console.error('Error creating custom token:', authError);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    console.log('User authenticated successfully with FID:', userId);

    // Create canvas
    console.log('Creating canvas...');
    const canvas = createCanvas(1080, 720);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#ffbd59';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load and draw image
    console.log('Loading image from URL:', drawingUrl);
    const image = await loadImage(drawingUrl);
    console.log('Image loaded successfully');
    
    // Calculate dimensions
    const maxWidth = canvas.width * 0.8;
    const maxHeight = canvas.height * 0.8;
    
    let width = image.width; 
    let height = image.height; 
    
    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width *= ratio;
      height *= ratio;
    }
    if (height > maxHeight) {
      const ratio = maxHeight / height;
      width *= ratio;
      height *= ratio;
    }

    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    ctx.drawImage(image, x, y, width, height);

    // Convert to base64
    console.log('Converting canvas to base64...');
    const base64Data = canvas.toBuffer('image/png').toString('base64');

    // Upload to Firebase Storage using Admin SDK
    console.log('Uploading to Firebase Storage with filename:', filename);
    const bucket = adminStorage.bucket();
    console.log('Bucket name:', bucket.name);
    
    const file = bucket.file(`shareImages/${filename}`);
    console.log('File path:', file.name);
    
    try {
      await file.save(Buffer.from(base64Data, 'base64'), {
        metadata: {
          contentType: 'image/png',
          metadata: {
            uploadedBy: userId,
            type: 'shareImage'
          }
        }
      });
      console.log('File uploaded successfully');
    } catch (uploadError) {
      console.error('Error uploading file:', uploadError);
      throw uploadError;
    }

    // Get download URL
    console.log('Getting download URL...');
    const [downloadUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500' // Far future expiration
    });
    
    console.log('Share image generated successfully:', downloadUrl);

    return NextResponse.json({ shareImageUrl: downloadUrl });
  } catch (error) {
    console.error('Error generating share image:', error);
    // Return more detailed error information
    return NextResponse.json({ 
      error: 'Failed to generate share image',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 