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
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
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