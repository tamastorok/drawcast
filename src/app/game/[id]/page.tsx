"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, arrayUnion, increment, writeBatch } from "firebase/firestore";
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
  guesses?: Array<{
    userId: string;
    username: string;
    guess: string;
    isCorrect: boolean;
    createdAt: Date;
  }>;
}

export default function GamePage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { isSDKLoaded, context } = useFrame();
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [guessError, setGuessError] = useState<string | null>(null);

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
      // Get game ID from either path or query parameter
      const gameId = id || searchParams.get('game');
      if (!gameId) return;

      try {
        const gameRef = doc(db, 'games', gameId as string);
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
            createdAt: data.createdAt.toDate(),
            guesses: data.guesses || []
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
  }, [id, searchParams]);

  const handleGuessSubmit = async () => {
    if (!currentGuess.trim() || !context?.user?.fid || !game) return;

    try {
      setIsSubmittingGuess(true);
      setGuessError(null);

      // Check if user has already guessed
      const existingGuess = game.guesses?.find(
        guess => guess.userId === context.user.fid.toString()
      );

      if (existingGuess) {
        setGuessError('You have already guessed this drawing');
        setCurrentGuess('');
        setIsSubmittingGuess(false);
        return;
      }

      const isCorrect = currentGuess.trim().toLowerCase() === game.prompt.toLowerCase();
      const guess = {
        userId: context.user.fid.toString(),
        username: context.user.username || 'Anonymous',
        guess: currentGuess.trim().toLowerCase(),
        isCorrect,
        createdAt: new Date()
      };

      // Use a batch to ensure atomicity
      const batch = writeBatch(db);

      // Update the game document with the new guess
      const gameRef = doc(db, 'games', id as string);
      batch.update(gameRef, {
        guesses: arrayUnion(guess),
        totalGuesses: increment(1),
        correctGuesses: isCorrect ? increment(1) : increment(0)
      });

      // If the guess is correct, update both the guesser's and creator's points
      if (isCorrect) {
        // Update guesser's points
        const guesserRef = doc(db, 'users', context.user.fid.toString());
        batch.update(guesserRef, {
          points: increment(10),
          correctGuesses: increment(1)
        });

        // Update creator's points and gameSolutions
        const creatorRef = doc(db, 'users', game.userFid);
        batch.update(creatorRef, {
          gameSolutions: increment(1)
        });
      }

      // Commit all updates
      await batch.commit();

      // Update local state
      setGame(prev => prev ? {
        ...prev,
        guesses: [...(prev.guesses || []), guess],
        totalGuesses: prev.totalGuesses + 1,
        correctGuesses: isCorrect ? prev.correctGuesses + 1 : prev.correctGuesses
      } : null);

      // Clear the input
      setCurrentGuess('');
    } catch (error) {
      console.error('Error submitting guess:', error);
      setGuessError('Failed to submit guess. Please try again.');
    } finally {
      setIsSubmittingGuess(false);
    }
  };

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

  // Check if user has already guessed
  const userGuess = game.guesses?.find(
    guess => guess.userId === context?.user?.fid?.toString()
  );

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

        {userGuess ? (
          <div className={`p-4 rounded-lg text-center ${
            userGuess.isCorrect 
              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100' 
              : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100'
          }`}>
            <p className="font-medium">You guessed: {userGuess.guess}</p>
            <p className="text-lg font-bold mt-2">
              {userGuess.isCorrect ? 'Correct!' : 'Wrong'}
            </p>
          </div>
        ) : (
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
            
            {guessError && (
              <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 rounded-md text-sm">
                {guessError}
              </div>
            )}
                
            <button
              onClick={handleGuessSubmit}
              disabled={!currentGuess.trim() || isSubmittingGuess}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSubmittingGuess ? 'Submitting...' : 'Submit Guess'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
} 