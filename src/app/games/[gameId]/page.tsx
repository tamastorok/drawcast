import { Metadata } from 'next';
import Demo from '~/components/Demo';

type Props = {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  { params }: Props
): Promise<Metadata> {
  const resolvedParams = await params;
  const gameUrl = `https://drawcast.xyz/games/${resolvedParams.gameId}`;
  
  return {
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
}

export default async function GamePage({ params }: Props) {
  const resolvedParams = await params;
  return <Demo initialGameId={resolvedParams.gameId} />;
} 