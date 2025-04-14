import { NextResponse } from 'next/server';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { createCanvas, loadImage } from 'canvas';

const firebaseConfig = {
  apiKey: "AIzaSyBlL2CIZTb-crfirYJ6ym6j6G4uQewu59k",
  authDomain: "drawcast-ae4cf.firebaseapp.com",
  projectId: "drawcast-ae4cf",
  storageBucket: "drawcast-ae4cf.firebasestorage.app",
  messagingSenderId: "998299398034",
  appId: "1:998299398034:web:0f8e8a516d69e8ecf9db4b",
  measurementId: "G-B6N4RGK1M5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

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

    // Upload to Firebase Storage
    console.log('Uploading to Firebase Storage with filename:', filename);
    const shareImageRef = ref(storage, `shareImages/${filename}`);
    await uploadString(shareImageRef, base64Data, 'base64', {
      contentType: 'image/png',
      customMetadata: {
        uploadedBy: userId,
        type: 'shareImage'
      }
    });

    // Get download URL
    console.log('Getting download URL...');
    const downloadUrl = await getDownloadURL(shareImageRef);
    console.log('Share image generated successfully:', downloadUrl);

    return NextResponse.json({ shareImageUrl: downloadUrl });
  } catch (error) {
    console.error('Error generating share image:', error);
    // Return more detailed error information
    return NextResponse.json({ 
      error: 'Failed to generate share image',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 