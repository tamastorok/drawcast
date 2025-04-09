import { Metadata } from 'next';

type PageProps = {
  params: Promise<{ gameId: string }>
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const resolvedParams = await params;
  const gameUrl = `https://drawcast.xyz/?game=${resolvedParams.gameId}`;
  
  return {
    metadataBase: new URL('https://drawcast.xyz'),
    title: 'Drawcast - Guess the Drawing!',
    description: 'Can you guess what this drawing is?',
    openGraph: {
      title: 'Drawcast - Guess the Drawing!',
      description: 'Can you guess what this drawing is?',
      images: ['/image.png'],
    },
    other: {
      'fc:frame': JSON.stringify({
        version: 'next',
        imageUrl: 'https://drawcast.xyz/image.png',
        aspectRatio: '3:2',
        button: {
          title: 'Guess the Drawing!',
          action: {
            type: 'launch_frame',
            name: 'Drawcast',
            url: gameUrl,
            splashImageUrl: 'https://drawcast.xyz/splash.png',
            splashBackgroundColor: '#FFF'
          }
        }
      })
    }
  };
}

export default function FramePage() {
  return null; // This page only serves meta tags
} 