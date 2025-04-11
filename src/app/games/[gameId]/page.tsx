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
  
  // Define metadata object
  const metadata = {
    title: `Drawcast - Game ${resolvedParams.gameId}`,
    description: 'Can you guess what this drawing is?',
    image: '/image.png',
    url: gameUrl,
    frame: {
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
    }
  };
  
  return {
    metadataBase: new URL('https://drawcast.xyz'),
    title: metadata.title,
    description: metadata.description,
    openGraph: {
      title: metadata.title,
      description: metadata.description,
      images: [metadata.image],
      url: metadata.url,
      type: 'website',
      siteName: 'Drawcast'
    },
    other: {
      'fc:frame': JSON.stringify(metadata.frame),
      'og:frame': JSON.stringify(metadata.frame)
    },
    alternates: {
      canonical: metadata.url
    }
  };
}

export default async function GamePage({ params }: Props) {
  const resolvedParams = await params;
  return <Demo initialGameId={resolvedParams.gameId} />;
} 