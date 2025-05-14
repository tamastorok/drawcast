import { Metadata } from 'next';
import Demo from '~/components/Demo';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { headers } from 'next/headers';

type Props = {
  params: Promise<{ fid: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(
  { params }: Props
): Promise<Metadata> {
  const resolvedParams = await params;
  const { fid } = resolvedParams;
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://drawcast.xyz';
  const profileUrl = `${baseUrl}/profile/${fid}`;
  const profileTitle = `Drawcast - Profile ${fid}`;
  const profileDescription = 'Check out this Drawcast profile!';

  // Initialize Firebase
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  });

  const db = getFirestore(app);
  const storage = getStorage(app);

  // Get user data and share image URL
  let shareImageUrl = `${baseUrl}/drawblank.png`;
  try {
    const userRef = doc(db, 'users', fid);
    const userDoc = await getDoc(userRef);
    const userData = userDoc.data();

    if (userData) {
      const shareImageRef = ref(storage, `shareProfile/${fid}.png`);
      shareImageUrl = await getDownloadURL(shareImageRef);
    }
  } catch (error) {
    console.error('Error fetching profile data:', error);
  }

  // Generate frame metadata - exactly matching game page structure
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

  return {
    metadataBase: new URL(baseUrl),
    title: profileTitle,
    description: profileDescription,
    openGraph: {
      title: profileTitle,
      description: profileDescription,
      images: [
        {
          url: shareImageUrl,
          width: 1200,
          height: 630,
          alt: profileTitle,
        }
      ],
      url: profileUrl,
      type: 'website',
      siteName: 'Drawcast'
    },
    other: {
      'fc:frame': JSON.stringify(frameMetadata)
    },
    alternates: {
      canonical: profileUrl
    }
  };
}

export default async function ProfilePage({ params }: Props) {
  const resolvedParams = await params;
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  
  // If it's a Warpcast frame request, return a simpler response
  if (userAgent.includes('Warpcast')) {
    return (
      <html>
        <head>
          <meta property="fc:frame" content={JSON.stringify({
            version: "vNext",
            image: "https://drawcast.xyz/drawblank.png",
            imageAspectRatio: "3:2",
            buttons: [{ label: "View Profile", action: "post_redirect" }],
            postUrl: `https://drawcast.xyz/profile/${resolvedParams.fid}`
          })} />
        </head>
        <body>Loading profile...</body>
      </html>
    );
  }

  return <Demo initialFid={resolvedParams.fid} />;
} 