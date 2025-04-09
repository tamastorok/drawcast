"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import Image from "next/image";
import { useFrame } from "~/components/providers/FrameProvider";
import { sdk } from '@farcaster/frame-sdk';

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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface GameData {
  imageUrl: string;
  prompt: string;
  userFid: string;
  username: string;
  totalGuesses: number;
  correctGuesses: number;
  createdAt: Date;
}

export default function GamePage() {
  const { id } = useParams();
  const { isSDKLoaded, context } = useFrame();
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [guessResult, setGuessResult] = useState<{
    isCorrect?: boolean;
    message: string;
  } | null>(null);

  // Initialize Frame
  useEffect(() => {
    const initializeFrame = async () => {
      if (isSDKLoaded) {
        try {
          await sdk.actions.ready({ disableNativeGestures: true });
          await sdk.actions.addFrame();
        } catch (error) {
          console.error('Error initializing frame:', error);
        }
      }
    };

    initializeFrame();
  }, [isSDKLoaded]);

  // Fetch game data
  useEffect(() => {
    const fetchGame = async () => {
      if (!id) return;

      try {
        const gameRef = doc(db, 'games', id as string);
        const gameDoc = await getDoc(gameRef);

        if (gameDoc.exists()) {
          const data = gameDoc.data();
          setGame({
            imageUrl: data.imageUrl,
            prompt: data.prompt,
            userFid: data.userFid,
            username: data.username,
            totalGuesses: data.totalGuesses || 0,
            correctGuesses: data.correctGuesses || 0,
            createdAt: data.createdAt.toDate()
          });
        } else {
          setError('Game not found');
        }
      } catch (error) {
        console.error('Error fetching game:', error);
        setError('Error loading game');
      } finally {
        setLoading(false);
      }
    };

    fetchGame();
  }, [id]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 p-4">
        <div className="w-[300px] mx-auto text-center text-gray-600 dark:text-gray-400">
          Loading game...
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-800 p-4">
        <div className="w-[300px] mx-auto text-center text-red-600 dark:text-red-400">
          {error || 'Game not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-800 p-4">
      <div className="w-[300px] mx-auto">
        <div className="text-center text-gray-600 dark:text-gray-400 mb-4">
          Drawing by {game.username}
        </div>
        <div className="text-center text-gray-600 dark:text-gray-400 mb-4">
          {game.totalGuesses}/10 players
        </div>
        <div className="aspect-square relative mb-4 bg-white dark:bg-gray-700 rounded-lg overflow-hidden">
          <Image
            src={game.imageUrl}
            alt="Drawing to guess"
            fill
            className="object-contain"
          />
        </div>
        <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-4">
          You will earn 10 points for successfully guessing this drawing.
        </p>
        <div className="space-y-4">
          <div>
            <input
              type="text"
              value={currentGuess}
              onChange={(e) => setCurrentGuess(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Type your guess here..."
              disabled={isSubmittingGuess}
            />
          </div>
          
          {guessResult && (
            <div className={`p-4 rounded-lg text-center ${
              guessResult.isCorrect 
                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100' 
                : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100'
            }`}>
              {guessResult.message}
            </div>
          )}
              
          <button
            onClick={async () => {
              if (!currentGuess.trim() || !context?.user?.fid) return;
              
              setIsSubmittingGuess(true);
              try {
                const isCorrect = currentGuess.trim().toLowerCase() === game.prompt.toLowerCase();
                setGuessResult({
                  isCorrect,
                  message: isCorrect ? 'Correct! You earned 10 points!' : 'Wrong guess, try again!'
                });
                setCurrentGuess('');
              } catch (error) {
                console.error('Error submitting guess:', error);
                setGuessResult({
                  isCorrect: false,
                  message: 'Error submitting guess'
                });
              } finally {
                setIsSubmittingGuess(false);
              }
            }}
            disabled={!currentGuess.trim() || isSubmittingGuess}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmittingGuess ? 'Submitting...' : 'Submit Guess'}
          </button>
        </div>
      </div>
    </div>
  );
} 