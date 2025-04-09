"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { initializeApp } from "firebase/app";
import Demo from "~/components/Demo";

const firebaseConfig = {
  apiKey: "AIzaSyBlL2CIZTb-crfirYJ6ym6j6G4uQewu59k",
  authDomain: "drawcast-ae4cf.firebaseapp.com",
  projectId: "drawcast-ae4cf",
  storageBucket: "drawcast-ae4cf.firebasestorage.app",
  messagingSenderId: "998299398034",
  appId: "1:998299398034:web:0f8e8a516d69e8ecf9db4b",
  measurementId: "G-B6N4RGK1M5"
};

// Initialize Firebase
initializeApp(firebaseConfig);

export default function Home() {
  const searchParams = useSearchParams();

  // Check for game ID in URL
  useEffect(() => {
    const gameId = searchParams.get('game');
    if (gameId) {
      // Store the game ID in localStorage
      localStorage.setItem('selectedGameId', gameId);
    }
  }, [searchParams]);

  return <Demo />;
}
