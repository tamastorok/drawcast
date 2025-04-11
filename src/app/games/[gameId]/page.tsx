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
  const gameTitle = `Drawcast - Game ${resolvedParams.gameId}`;
  const gameDescription = 'Can you guess what this drawing is?';

  // Generate frame metadata
  const frameMetadata = {
    version: "next",
    imageUrl: "https://drawcast.xyz/image.png",
    aspectRatio: "3:2",
    button: {
      title: "Guess the Drawing!",
      action: {
        type: "launch_frame",
        name: "Drawcast",
        url: gameUrl,
        splashImageUrl: "https://drawcast.xyz/splash.png",
        splashBackgroundColor: "#FFF"
      }
    }
  };
  
  return {
    metadataBase: new URL('https://drawcast.xyz'),
    title: gameTitle,
    description: gameDescription,
    openGraph: {
      title: gameTitle,
      description: gameDescription,
      images: ['/image.png'],
      url: gameUrl,
      type: 'website',
      siteName: 'Drawcast'
    },
    other: {
      // Only include the stringified frame metadata
      'fc:frame': JSON.stringify(frameMetadata)
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