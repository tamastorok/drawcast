import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: { gameId: string }
}): Promise<Metadata> {
  const gameUrl = `https://drawcast.xyz/?game=${params.gameId}`;
  
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