import { NextResponse } from 'next/server';

async function fetchAndProcessImage(imageUrl: string) {
    const response = await fetch(imageUrl);
    
    // Ensure we're getting a PNG
    if (!response.headers.get('content-type')?.includes('image/png')) {
      // If not PNG, return error
    throw new Error('Image must be PNG format');
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
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }
    
    return await fetchAndProcessImage(imageUrl);
  } catch (error) {
    console.error('Error fetching image:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch image' 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();
    
    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }
    
    return await fetchAndProcessImage(imageUrl);
  } catch (error) {
    console.error('Error fetching image:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch image' 
    }, { status: 500 });
  }
} 