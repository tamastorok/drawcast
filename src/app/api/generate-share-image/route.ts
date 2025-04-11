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
    const { drawingUrl, gameId } = await request.json();

    // Create canvas
    const canvas = createCanvas(1080, 720);
    const ctx = canvas.getContext('2d');

    // Fill background
    ctx.fillStyle = '#ffbd59';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load and draw image
    const image = await loadImage(drawingUrl);
    
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
    const base64Data = canvas.toBuffer('image/png').toString('base64');

    // Upload to Firebase Storage
    const shareImageRef = ref(storage, `shareImages/${gameId}.png`);
    await uploadString(shareImageRef, base64Data, 'base64', {
      contentType: 'image/png'
    });

    // Get download URL
    const downloadUrl = await getDownloadURL(shareImageRef);

    return NextResponse.json({ shareImageUrl: downloadUrl });
  } catch (error) {
    console.error('Error generating share image:', error);
    return NextResponse.json(
      { error: 'Failed to generate share image' },
      { status: 500 }
    );
  }
} 