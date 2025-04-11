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
      type: 'website',
      siteName: 'Drawcast'
    },
    other: {
      'fc:frame': 'next',
      'fc:frame:image': 'https://drawcast.xyz/image.png',
      'fc:frame:button:1': 'Guess the Drawing!',
      'fc:frame:post_url': gameUrl,
      'og:title': `Drawcast - Game ${resolvedParams.gameId}`,
      'og:description': 'Can you guess what this drawing is?',
      'og:image': 'https://drawcast.xyz/image.png',
      'og:url': gameUrl
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