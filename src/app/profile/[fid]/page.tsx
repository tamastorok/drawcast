import { Metadata } from 'next';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import Image from 'next/image';

type Props = {
  params: { fid: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { fid } = params;

  // Initialize Firebase
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });

  const db = getFirestore(app);
  const storage = getStorage(app);

  try {
    // Get user data from Firestore
    const userRef = doc(db, 'users', fid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return {
        title: 'Profile - Drawcast',
        description: 'Drawcast - Draw and Guess Game',
        openGraph: {
          title: 'Profile - Drawcast',
          description: 'Drawcast - Draw and Guess Game',
          images: ['https://drawcast.xyz/drawblank.png'],
        },
        twitter: {
          card: 'summary_large_image',
          title: 'Profile - Drawcast',
          description: 'Drawcast - Draw and Guess Game',
          images: ['https://drawcast.xyz/drawblank.png'],
        },
      };
    }

    const userData = userDoc.data();
    const level = Math.floor((userData.points || 0) / 100) + 1;
    const levelName = getLevelName(level);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://drawcast.xyz';
    const profileUrl = `${baseUrl}/profile/${fid}`;

    // Get share image URL directly from Firebase Storage
    let shareImageUrl = 'https://drawcast.xyz/drawblank.png';
    try {
      const shareImageRef = ref(storage, `shareProfile/${fid}.png`);
      shareImageUrl = await getDownloadURL(shareImageRef);
    } catch (error) {
      console.error('Error getting share image URL:', error);
    }

    // Generate frame metadata
    const frameMetadata = {
      version: "next",
      imageUrl: shareImageUrl,
      aspectRatio: "3:2",
      button: {
        title: "View Profile",
        action: {
          type: "launch_frame",
          name: "Drawcast",
          url: profileUrl,
          splashImageUrl: `${baseUrl}/splash.png`,
          splashBackgroundColor: "#FFF"
        }
      }
    };

    const title = `${userData.username || `@${fid}`} - Drawcast`;
    const description = `Level ${level} ${levelName} | Points: ${userData.points || 0} | Overall Rank: #${userData.pointsRank || 'N/A'} | Drawer Rank: #${userData.drawersRank || 'N/A'} | Guesser Rank: #${userData.guessersRank || 'N/A'}`;

    return {
      metadataBase: new URL(baseUrl),
      title,
      description,
      openGraph: {
        title,
        description,
        images: [
          {
            url: shareImageUrl,
            width: 1200,
            height: 630,
            alt: title,
          }
        ],
        url: profileUrl,
        type: 'website',
        siteName: 'Drawcast'
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [shareImageUrl],
      },
      other: {
        'fc:frame': JSON.stringify(frameMetadata)
      },
      alternates: {
        canonical: profileUrl
      }
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Profile - Drawcast',
      description: 'Drawcast - Draw and Guess Game',
      openGraph: {
        title: 'Profile - Drawcast',
        description: 'Drawcast - Draw and Guess Game',
        images: ['https://drawcast.xyz/drawblank.png'],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Profile - Drawcast',
        description: 'Drawcast - Draw and Guess Game',
        images: ['https://drawcast.xyz/drawblank.png'],
      },
    };
  }
}

function getLevelName(level: number): string {
  const levelNames = [
    'Novice Artist',
    'Sketch Enthusiast',
    'Drawing Apprentice',
    'Creative Explorer',
    'Artistic Visionary',
    'Master Doodler',
    'Drawing Virtuoso',
    'Artistic Genius',
    'Drawing Legend',
    'Artistic Mastermind'
  ];
  return levelNames[Math.min(level - 1, levelNames.length - 1)] || 'Drawing Master';
}

export default async function ProfilePage({ params }: Props) {
  const { fid } = params;

  // Initialize Firebase
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });

  const db = getFirestore(app);
  const userRef = doc(db, 'users', fid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold">Profile Not Found</h1>
        <p className="text-gray-600">The requested profile could not be found.</p>
      </div>
    );
  }

  const userData = userDoc.data();
  const level = Math.floor((userData.points || 0) / 100) + 1;
  const levelName = getLevelName(level);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32 mb-4">
            <Image
              src={userData.pfpUrl || `https://warpcast.com/${fid}/pfp`}
              alt={`${userData.username || `@${fid}`}'s profile picture`}
              fill
              className="rounded-full"
            />
          </div>
          <h1 className="text-2xl font-bold">{userData.username || `@${fid}`}</h1>
          <p className="text-gray-600">Level {level}: {levelName}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 w-full">
            <div className="text-center">
              <p className="font-semibold">Points</p>
              <p>{userData.points || 0}</p>
            </div>
            <div className="text-center">
              <p className="font-semibold">Overall Rank</p>
              <p>#{userData.pointsRank || 'N/A'}</p>
            </div>
            <div className="text-center">
              <p className="font-semibold">Drawer Rank</p>
              <p>#{userData.drawersRank || 'N/A'}</p>
            </div>
            <div className="text-center">
              <p className="font-semibold">Guesser Rank</p>
              <p>#{userData.guessersRank || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 