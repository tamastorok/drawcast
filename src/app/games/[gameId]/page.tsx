import { Metadata } from 'next';
import Demo from '~/components/Demo';

type Props = {
  params: { gameId: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export async function generateMetadata(
  { params }: Props
): Promise<Metadata> {
  const gameUrl = `https://drawcast.xyz/games/${params.gameId}`;
  
  return {
    metadataBase: new URL('https://drawcast.xyz'),
    title: `Drawcast - Game ${params.gameId}`,
    description: 'Can you guess what this drawing is?',
    openGraph: {
      title: `Drawcast - Game ${params.gameId}`,
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

export default function GamePage({ params }: Props) {
  return <Demo initialGameId={params.gameId} />;
} 