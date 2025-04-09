import { Metadata } from 'next';

type PageProps = {
  params: Promise<{ gameId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(
  { params }: PageProps
): Promise<Metadata> {
  const resolvedParams = await params;
  console.log('Generating metadata for game ID:', resolvedParams.gameId);
  
  const gameUrl = `https://drawcast.xyz/games/${resolvedParams.gameId}`;
  console.log('Generated game URL:', gameUrl);
  
  const metadata: Metadata = {
    metadataBase: new URL('https://drawcast.xyz'),
    title: `Drawcast - Game ${resolvedParams.gameId}`,
    description: 'Can you guess what this drawing is?',
    openGraph: {
      title: `Drawcast - Game ${resolvedParams.gameId}`,
      description: 'Can you guess what this drawing is?',
      images: ['/image.png'],
      url: gameUrl,
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
    },
    alternates: {
      canonical: gameUrl
    }
  };

  console.log('Generated metadata:', metadata);
  return metadata;
}

export default function FramePage() {
  return null; // This page only serves meta tags
} 