import { Metadata } from 'next';
import Demo from '~/components/Demo';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

  // Fetch game data to get the share image URL
  const app = initializeApp({
    apiKey: "AIzaSyBlL2CIZTb-crfirYJ6ym6j6G4uQewu59k",
    authDomain: "drawcast-ae4cf.firebaseapp.com",
    projectId: "drawcast-ae4cf",
    storageBucket: "drawcast-ae4cf.firebasestorage.app",
    messagingSenderId: "998299398034",
    appId: "1:998299398034:web:0f8e8a516d69e8ecf9db4b",
    measurementId: "G-B6N4RGK1M5"
  });
  const db = getFirestore(app);
  const gameRef = doc(db, 'games', resolvedParams.gameId);
  const gameDoc = await getDoc(gameRef);
  const gameData = gameDoc.data();

  // Generate frame metadata
  const frameMetadata = {
    version: "next",
    imageUrl: gameData?.shareImageUrl || `https://drawcast.xyz/image.png`,
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
      images: [
        {
          url: gameData?.shareImageUrl || `/games/${resolvedParams.gameId}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: gameTitle,
        }
      ],
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