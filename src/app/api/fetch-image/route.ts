import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();
    
    const response = await fetch(imageUrl);
    
    // Ensure we're getting a PNG
    if (!response.headers.get('content-type')?.includes('image/png')) {
      // If not PNG, return error
      return NextResponse.json({ error: 'Image must be PNG format' }, { status: 400 });
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Set proper content type and cache control headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000',
        'Content-Length': buffer.length.toString()
      },
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
} 