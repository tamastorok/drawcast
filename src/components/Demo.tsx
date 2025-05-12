"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useFrame } from "~/components/providers/FrameProvider";
import { sdk } from '@farcaster/frame-sdk'
import { initializeApp, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, getDocs, arrayUnion, increment, writeBatch, where, limit, startAfter, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";
import { createCoin, getCoinCreateFromLogs } from "@zoralabs/coins-sdk";
import { createWalletClient, createPublicClient, http, custom } from "viem";
import { base } from "viem/chains";
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { DaimoPayButton } from '@daimo/pay';
import { getAddress } from 'viem';

// Add baseUSDC constant
const baseUSDC = {
  chainId: 8453,
  token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
};

interface LeaderboardUser {
  fid: number;
  username: string;
  pfpUrl: string;
  points: number;
  isPremium?: boolean;
  isEarlyAdopter?: boolean;
  rank?: number;
  pointsRank?: number;
  drawersRank?: number;
  guessersRank?: number;
  gameSolutions?: number;
  correctGuesses?: number;
  isCoined?: boolean;
  weeklyPoints?: number;
  weeklyGameSolutions?: number;
  weeklyCorrectGuesses?: number;
  dailyGamesCreated?: number;
  dailyShared?: number;
  dailyCorrectGuesses?: number;
  dailyQuests?: number;
  isDailyQuestCompleted?: boolean;
}

interface LeaderboardData {
  topUsers: LeaderboardUser[];
  currentUser: LeaderboardUser | null;
}

interface Guess {
  userId: string;
  username: string;
  guess: string;
  isCorrect: boolean;
  createdAt: Date;
}

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  error: string | null;
}

// Add this at the top of the file, after the imports
const styles = `
  @keyframes glow {
    0% {
      box-shadow: 0 0 5px rgba(234, 179, 8, 0.5);
    }
    50% {
      box-shadow: 0 0 15px rgba(234, 179, 8, 0.8);
    }
    100% {
      box-shadow: 0 0 5px rgba(234, 179, 8, 0.5);
    }
  }

  .animate-glow {
    animation: glow 2s ease-in-out infinite;
  }
`;

// Add this right after the styles constant
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export default function Demo({ initialGameId }: { initialGameId?: string }) {
  const { isSDKLoaded, context } = useFrame();
  const [showProfile, setShowProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGuess, setShowGuess] = useState(!!initialGameId);
  const [selectedGame, setSelectedGame] = useState<typeof games[0] | null>(null);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [isPromptLoaded, setIsPromptLoaded] = useState(false);
  const [currentGuess, setCurrentGuess] = useState('');
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [guessError, setGuessError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<{
    correctGuesses: number;
    points: number;
    created: number;
    gameSolutions: number;
    isEarlyAdopter?: boolean;
    streak?: number;
    streakPoints?: number;
    isCoined?: boolean;
    weeklyWins?: number;
    weeklyTopDrawer?: number;
    weeklyTopGuesser?: number;
    weeklyPoints?: number;
    dailyGamesCreated?: number;
    dailyShared?: number;
    dailyCorrectGuesses?: number;
    dailyQuests?: number;
    isDailyQuestCompleted?: boolean;
    isPremium?: boolean;
  } | null>(null);
  const [createdGames, setCreatedGames] = useState<Array<{
    id: string;
    imageUrl: string;
    shareImageUrl?: string;
    prompt: string;
    totalGuesses: number;
    correctGuesses: number;
    createdAt: Date;
    guesses?: Guess[];
    isMinted?: boolean;
    tokenAddress?: string;
  }>>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [mintingGames, setMintingGames] = useState<Set<string>>(new Set());
  const [games, setGames] = useState<Array<{
    id: string;
    imageUrl: string;
    prompt: string;
    createdAt: Date;
    userFid: string;
    username: string;
    guesses?: Guess[];
    expiredAt: Date;
    totalGuesses: number;
    isBanned?: boolean;
  }>>([]);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [showTimeUpPopup, setShowTimeUpPopup] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [lastCreatedGameId, setLastCreatedGameId] = useState<string | null>(null);
  const [isDrawingsExpanded, setIsDrawingsExpanded] = useState(false);
  const [showWarpcastModal, setShowWarpcastModal] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: true,
    isAuthenticated: false,
    userId: null,
    error: null
  });
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>({
    topUsers: [],
    currentUser: null
  });
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const [newLevelInfo, setNewLevelInfo] = useState<{ level: number; name: string } | null>(null);
  const [previousLevel, setPreviousLevel] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCanvasEmpty, setIsCanvasEmpty] = useState(true);
  const [activeGuessTab, setActiveGuessTab] = useState<'new' | 'solved' | 'wrong'>('new');
  const [selectedDrawing, setSelectedDrawing] = useState<{
    id: string;
    imageUrl: string;
    prompt: string;
    totalGuesses: number;
    correctGuesses: number;
    createdAt: Date;
    guesses?: Guess[];
  } | null>(null);
  const [isLoadingNextDrawing, setIsLoadingNextDrawing] = useState(false);
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<'points' | 'drawers' | 'guessers'>('points');
  const [activeTimePeriodTab, setActiveTimePeriodTab] = useState<'all-time' | 'weekly'>('weekly');
  const [showZoraInfoModal, setShowZoraInfoModal] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const GAMES_PER_PAGE = 150;
  const [showQuest, setShowQuest] = useState(false);
  const [isDailyQuestCompleted, setIsDailyQuestCompleted] = useState(false);
  const [selectedColor, setSelectedColor] = useState('black');
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [premiumExpirationDays, setPremiumExpirationDays] = useState<number | null>(null);
  // Add wallet connection state

  // Add function to calculate remaining time
  const getQuestTimeInfo = useCallback(() => {
    const now = new Date();
    const questEndTime = new Date();
    questEndTime.setUTCHours(12, 0, 0, 0); // 12 PM UTC

    // If current time is past 12 PM UTC, set to next day
    if (now > questEndTime) {
      questEndTime.setUTCDate(questEndTime.getUTCDate() + 1);
    }

    const timeDiff = questEndTime.getTime() - now.getTime();
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  }, []);

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
  let app;
  try {
    app = initializeApp(firebaseConfig);
  } catch {
    // If Firebase is already initialized, get the existing instance
    app = getApp();
  }
  const db = getFirestore(app);
  const storage = getStorage(app);
  const auth = getAuth(app);
  const analytics = getAnalytics(app);

  // Helper function to track events
  const trackEvent = useCallback((eventName: string, eventParams?: Record<string, string | number | boolean>) => {
    if (typeof window !== 'undefined' && analytics) {
      logEvent(analytics, eventName, {
        ...eventParams,
        userFid: context?.user?.fid || 'anonymous',
        username: context?.user?.username || 'anonymous',
        timestamp: new Date().toISOString()
      });
    }
  }, [analytics, context?.user?.fid, context?.user?.username]);

  const castTextVariations = [
    "Think you can crack this drawing on Drawcast? Prove it and earn points. 🎨🕵️",
    "Can you guess what it is? Submit the correct answer to earn points! 🎨✨",
    "Challenge: Guess this drawing and earn points! 🎨🏆",
    "Here is a new drawing puzzle. Can you solve it? 🎨🧩",
    "New sketch dropped on Drawcast! Take a guess and earn points! 👇🎨",
    "Think you're good at guessing? Try this drawing! 🎨🎯",
    "New drawing challenge: Guess it right and earn points! 🎨💰",
    "Can you figure out what it is? Take a guess! 🎨🤔",
    "This masterpiece needs your brainpower. Can you guess what it is? 🎨🧠",
    "I've got a new drawing for you to guess. Ready? 🎨"
  ];

  // Initialize Frame
  useEffect(() => {
    const initializeFrame = async () => {
      console.log('Checking SDK state:', { isSDKLoaded, context });
      
      if (!isSDKLoaded || !context) {
        console.log('SDK or context not ready yet, waiting...');
        return;
      }

      try {
        console.log('SDK and context ready, initializing...');
        
        // Initialize SDK with native gestures disabled
        await sdk.actions.ready({ disableNativeGestures: true });
        
        // Add frame
        await sdk.actions.addFrame();
        
        // Track frame addition
        trackEvent('frame_added');
        
        // Get the current URL and log all parameters
        const url = new URL(window.location.href);
        console.log('Current URL:', url.href);
        console.log('All URL parameters:', Object.fromEntries(url.searchParams));
        
        // Try different ways to get the game ID
        let gameId = initialGameId || 
                    url.searchParams.get('game') || 
                    url.searchParams.get('id') || 
                    url.pathname.split('/').pop();

        // Check if we're coming from a Warpcast frame
        if (!gameId && url.searchParams.has('url')) {
          try {
            const frameUrl = decodeURIComponent(url.searchParams.get('url') || '');
            console.log('Decoded frame URL:', frameUrl);
            const frameUrlObj = new URL(frameUrl);
            gameId = frameUrlObj.searchParams.get('game') || 
                    frameUrlObj.searchParams.get('id') || 
                    frameUrlObj.pathname.split('/').pop();
            console.log('Game ID from frame URL:', gameId);
          } catch (error) {
            console.log('Error parsing frame URL:', error);
          }
        }
        
        console.log('Final game ID:', gameId);
        
        if (gameId) {
          console.log('Found game ID:', gameId);
          // Reset other states
          setShowProfile(false);
          setShowLeaderboard(false);
          setIsDrawing(false);
          setShowGuess(true);
          
          // Fetch the game data
          const fetchGame = async () => {
            try {
              console.log('Fetching game data for ID:', gameId);
              const gameRef = doc(db, 'games', gameId);
              const gameDoc = await getDoc(gameRef);
              
              if (gameDoc.exists()) {
                console.log('Game found in Firestore:', gameId);
                const gameData = gameDoc.data();
                setSelectedGame({
                  id: gameId,
                  imageUrl: gameData.imageUrl,
                  prompt: gameData.prompt,
                  createdAt: gameData.createdAt.toDate(),
                  expiredAt: gameData.expiredAt.toDate(),
                  userFid: gameData.userFid,
                  username: gameData.username,
                  guesses: gameData.guesses || [],
                  totalGuesses: gameData.totalGuesses || 0
                });
                console.log('Game state updated, showing guess interface');
              } else {
                console.log('Game not found in Firestore:', gameId);
              }
            } catch (error) {
              console.error('Error fetching game:', error);
            }
          };

          await fetchGame();
        } else {
          console.log('No game ID found in URL or path');
        }
      } catch (error) {
        console.error('Error during initialization:', error);
      }
    };

    initializeFrame();
  }, [isSDKLoaded, context]);

  // Initialize Firebase auth state
  useEffect(() => {
    const initializeUser = async () => {
      console.log('Initializing user with context:', context?.user);
      
      try {
        // Always try anonymous authentication first
        console.log('Attempting anonymous authentication...');
        await signInAnonymously(auth);
        console.log('Successfully authenticated anonymously');

        // If we have Farcaster context, update the user document
        if (context?.user?.fid) {
          const fid = context.user.fid.toString();
          console.log('Updating user document for FID:', fid);
          
          const userRef = doc(db, 'users', fid);
          const userDoc = await getDoc(userRef);
          
          const userData = {
            username: context.user.username || 'Anonymous',
            pfpUrl: context.user.pfpUrl || '',
            lastSeen: new Date(),
            isAnonymous: true,
            fid: fid
          };

          if (!userDoc.exists()) {
            console.log('Creating new user document');
            await setDoc(userRef, {
              ...userData,
              createdAt: new Date(),
              lastKnownLevel: 1,
              points: 0,
              correctGuesses: 0,
              gamesCreated: 0,
              gameSolutions: 0,
              streak: 1,
              streakPoints: 1,
              weeklyPoints: 0,
              weeklyGameSolutions: 0,
              weeklyCorrectGuesses: 0,
              dailyGamesCreated: 0,
              dailyShared: 0,
              dailyCorrectGuesses: 0,
              dailyQuests: 0,
              isFriendNotificationSent: false
            });
          } else {
            console.log('Updating existing user document');
            const currentLevel = getLevelInfo(userDoc.data().points || 0).level;
            const lastKnownLevel = userDoc.data().lastKnownLevel || 1;
            // Initialize previousLevel from Firestore
            setPreviousLevel(lastKnownLevel);
            
            // Only update the fields we want to change, preserve existing streak values
            await setDoc(userRef, {
              ...userData,
              lastKnownLevel: currentLevel
            }, { merge: true });
          }

          // Update streak when user opens the app
          await updateUserStreak(fid);
        }

        setAuthState({
          isLoading: false,
          isAuthenticated: true,
          userId: auth.currentUser?.uid || null,
          error: null
        });
      } catch (error) {
        console.error('Error during authentication:', error);
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userId: null,
          error: 'Failed to authenticate'
        });
      }
    };

    initializeUser();
  }, [context?.user, db, auth]);

  // Update the level change effect to handle first load
  useEffect(() => {
    if (userStats?.points !== undefined && context?.user?.fid) {
      const currentLevel = getLevelInfo(userStats.points).level;
      
      // Check if we should show level up modal
      const shouldShowLevelUp = previousLevel !== null && currentLevel > previousLevel;
      
      if (shouldShowLevelUp && !isDrawing) {  // Only show if not on drawing page
        console.log('Level up detected:', { previousLevel, currentLevel });
        setNewLevelInfo(getLevelInfo(userStats.points));
        setShowLevelUpModal(true);

        // Update lastKnownLevel in Firestore
        const userRef = doc(db, 'users', context.user.fid.toString());
        setDoc(userRef, {
          lastKnownLevel: currentLevel
        }, { merge: true });
      }
      
      // Update previous level
      setPreviousLevel(currentLevel);
    }
  }, [userStats?.points, context?.user?.fid, db, isDrawing]);

  // Fetch and generate random prompt
  useEffect(() => {
    const generatePrompt = async () => {
      try {
        // Fetch only nouns document from the prompts collection
        const nounsRef = doc(db, 'prompts', 'nouns');
        const nounsDoc = await getDoc(nounsRef);
        
        if (nounsDoc.exists()) {
          const nouns = nounsDoc.data().words || [];
          
          if (nouns.length > 0) {
            // Get random noun
            const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
            
            console.log('Selected noun:', randomNoun);
            
            setCurrentPrompt(randomNoun);
            setIsPromptLoaded(true);
          } else {
            console.log('No words found in nouns array');
            setCurrentPrompt('Error loading prompt');
            setIsPromptLoaded(false);
          }
        } else {
          console.log('Nouns document does not exist');
          setCurrentPrompt('Error loading prompt');
          setIsPromptLoaded(false);
        }
      } catch (error) {
        console.error('Error generating prompt:', error);
        setCurrentPrompt('Error loading prompt');
        setIsPromptLoaded(false);
      }
    };

    if (isDrawing) {
      setIsPromptLoaded(false);
      // Verify Firebase Storage is initialized
      try {
        const bucket = storage.app.options.storageBucket;
        console.log('Firebase Storage bucket:', bucket);
        if (!bucket) {
          console.error('Storage bucket is not configured');
        }
      } catch (error) {
        console.error('Error checking storage configuration:', error);
      }

      generatePrompt();
    }
  }, [isDrawing, db]);

  // Initialize canvas when drawing mode is activated
  useEffect(() => {
    if (isDrawing && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set display size to match container
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        // Set actual pixel dimensions to 600x600
        canvas.width = 424;
        canvas.height = 424;
        
        // Fill canvas with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Set initial drawing style
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isDrawing]); // Remove selectedColor dependency

  // Update stroke color when selectedColor changes
  useEffect(() => {
    if (isDrawing && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = selectedColor;
      }
    }
  }, [selectedColor, isDrawing]);

  // Timer effect
  useEffect(() => {
    if (isDrawing && isPromptLoaded && !showTimeUpPopup) {
      setTimeLeft(30);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setShowTimeUpPopup(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isDrawing, isPromptLoaded, showTimeUpPopup]);

  // Reset timer when starting new drawing
  const handleStartNew = async () => {
    setShowTimeUpPopup(false);
    setTimeLeft(30);
    setCurrentPrompt('Loading prompt...');
    setIsPromptLoaded(false);
    
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill canvas with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    try {
      // Fetch only nouns document
      const nounsRef = doc(db, 'prompts', 'nouns');
      const nounsDoc = await getDoc(nounsRef);
      
      if (nounsDoc.exists()) {
        const nouns = nounsDoc.data().words || [];
        
        if (nouns.length > 0) {
          // Get random noun
          const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
          
          setCurrentPrompt(randomNoun);
          setIsPromptLoaded(true);
        } else {
          console.log('No words found in nouns array');
          setCurrentPrompt('Error loading prompt');
          setIsPromptLoaded(false);
        }
      } else {
        console.log('Nouns document does not exist');
        setCurrentPrompt('Error loading prompt');
        setIsPromptLoaded(false);
      }
    } catch (error) {
      console.error('Error generating new prompt:', error);
      setCurrentPrompt('Error loading prompt');
      setIsPromptLoaded(false);
    }
  };

  // Drawing functions
  const startDrawing = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const normalizedX = (x - rect.left) * scaleX;
    const normalizedY = (y - rect.top) * scaleY;

    setIsDrawingActive(true);
    lastPositionRef.current = { x: normalizedX, y: normalizedY };
  };

  const draw = (x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !isDrawingActive || !lastPositionRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const normalizedX = (x - rect.left) * scaleX;
    const normalizedY = (y - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(lastPositionRef.current.x, lastPositionRef.current.y);
    ctx.lineTo(normalizedX, normalizedY);
    ctx.stroke();

    lastPositionRef.current = { x: normalizedX, y: normalizedY };
  };

  const stopDrawing = () => {
    setIsDrawingActive(false);
    lastPositionRef.current = null;
  };

  const drawDot = (x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const normalizedX = (x - rect.left) * scaleX;
    const normalizedY = (y - rect.top) * scaleY;

    // Save the current context state
    ctx.save();
    
    // Set dot-specific styles
    ctx.lineWidth = 2;
    ctx.fillStyle = ctx.strokeStyle; // Match fill color with stroke color
    ctx.beginPath();
    ctx.arc(normalizedX, normalizedY, 2, 0, 2 * Math.PI);
    ctx.fill();  // Fill the circle
    ctx.stroke(); // Add a stroke for better visibility
    
    // Restore the previous context state
    ctx.restore();
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    drawDot(touch.clientX, touch.clientY);
    startDrawing(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawDot(e.clientX, e.clientY);
    startDrawing(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    draw(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    stopDrawing();
  };

  // Fetch user stats when profile is shown
  useEffect(() => {
    const fetchUserData = async () => {
      if (!context?.user?.fid) return;

      try {
        // Fetch user stats
        const userRef = doc(db, 'users', context.user.fid.toString());
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserStats({
            correctGuesses: userData.correctGuesses || 0,
            points: userData.points || 0,
            created: userData.gamesCreated || 0,
            gameSolutions: userData.gameSolutions || 0,
            isEarlyAdopter: userData.isEarlyAdopter || false,
            streak: userData.streak || 1,
            streakPoints: userData.streakPoints || 1,
            isCoined: userData.isCoined || false,
            weeklyWins: userData.weeklyWins || 0,
            weeklyTopDrawer: userData.weeklyTopDrawer || 0,
            weeklyTopGuesser: userData.weeklyTopGuesser || 0,
            weeklyPoints: userData.weeklyPoints || 0,
            dailyGamesCreated: userData.dailyGamesCreated || 0,
            dailyShared: userData.dailyShared || 0,
            dailyCorrectGuesses: userData.dailyCorrectGuesses || 0,
            dailyQuests: userData.dailyQuests || 0,
            isDailyQuestCompleted: userData.isDailyQuestCompleted || false,
            isPremium: userData.isPremium || false
          });
        } else {
          setUserStats({
            correctGuesses: 0,
            points: 0,
            created: 0,
            gameSolutions: 0,
            isEarlyAdopter: false,
            streak: 1,
            streakPoints: 1,
            isCoined: false,
            weeklyWins: 0,
            weeklyTopDrawer: 0,
            weeklyTopGuesser: 0,
            weeklyPoints: 0,
            dailyGamesCreated: 0,
            dailyShared: 0,
            dailyCorrectGuesses: 0,
            dailyQuests: 0,
            isDailyQuestCompleted: false,
            isPremium: false
          });
        }

        // Fetch leaderboard data if profile or leaderboard page is shown
        if (showProfile || showLeaderboard) {
          // Fetch all users for ranking
          const usersRef = collection(db, 'users');
          const usersSnapshot = await getDocs(usersRef);
          
          // Process users
          const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              fid: parseInt(doc.id),
              username: data.username || 'Anonymous',
              pfpUrl: data.pfpUrl || '',
              points: data.points || 0,
              isPremium: data.isPremium || false,
              isEarlyAdopter: data.isEarlyAdopter || false,
              isCoined: data.isCoined || false,
              gameSolutions: data.gameSolutions || 0,
              correctGuesses: data.correctGuesses || 0,
              weeklyPoints: data.weeklyPoints || 0,
              weeklyTopDrawer: data.weeklyTopDrawer || 0,
              weeklyTopGuesser: data.weeklyTopGuesser || 0
            };
          });

          // Sort users by different criteria
          const pointsRanked = [...users].sort((a, b) => b.points - a.points);
          const drawersRanked = [...users].sort((a, b) => (b.gameSolutions || 0) - (a.gameSolutions || 0));
          const guessersRanked = [...users].sort((a, b) => (b.correctGuesses || 0) - (a.correctGuesses || 0));

          // Find current user's ranks
          const currentUserFid = context.user.fid;
          const pointsRank = pointsRanked.findIndex(user => user.fid === currentUserFid) + 1;
          const drawersRank = drawersRanked.findIndex(user => user.fid === currentUserFid) + 1;
          const guessersRank = guessersRanked.findIndex(user => user.fid === currentUserFid) + 1;

          // Update leaderboard data with all ranks
          setLeaderboardData(prev => ({
            ...prev,
            currentUser: {
              fid: currentUserFid,
              username: context.user.username || 'Anonymous',
              pfpUrl: context.user.pfpUrl || '',
              points: userStats?.points || 0,
              pointsRank,
              drawersRank,
              guessersRank,
              gameSolutions: userStats?.gameSolutions || 0,
              correctGuesses: userStats?.correctGuesses || 0,
              isCoined: userStats?.isCoined || false,
              weeklyPoints: userStats?.weeklyPoints || 0,
              weeklyTopDrawer: userStats?.weeklyTopDrawer || 0,
              weeklyTopGuesser: userStats?.weeklyTopGuesser || 0
            }
          }));
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserStats(null);
      }
    };

    fetchUserData();
  }, [context?.user?.fid, showProfile, showLeaderboard, showGuess, db]);

  // Fetch created games when section is expanded
  useEffect(() => {
    const fetchCreatedGames = async () => {
      if (!context?.user?.fid || !isDrawingsExpanded) return;

      try {
        setIsLoadingGames(true);
        const gamesRef = collection(db, 'games');
        const q = query(
          gamesRef,
          where('userFid', '==', context.user.fid.toString()),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        
        const gamesData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            imageUrl: data.imageUrl,
            shareImageUrl: data.shareImageUrl,
            prompt: data.prompt,
            totalGuesses: data.totalGuesses || 0,
            correctGuesses: data.correctGuesses || 0,
            createdAt: data.createdAt.toDate(),
            guesses: data.guesses || [],
            isMinted: data.isMinted || false,
            tokenAddress: data.tokenAddress,
            isBanned: data.isBanned || false
          };
        }).filter(game => !game.isBanned); // Filter out banned drawings
        
        setCreatedGames(gamesData);
      } catch (error) {
        console.error('Error fetching games:', error);
        setCreatedGames([]);
      } finally {
        setIsLoadingGames(false);
      }
    };

    fetchCreatedGames();
  }, [context?.user?.fid, isDrawingsExpanded, db]);

  const getLevelInfo = (points: number) => {
    if (points >= 24000) return { level: 16, name: "Drawing God 💎" };
    if (points >= 18000) return { level: 15, name: "Cosmic Creator 🌌" };
    if (points >= 12000) return { level: 14, name: "Divine Illustrator ✨" };
    if (points >= 8000) return { level: 13, name: "Legendary Muse 🕊️" };
    if (points >= 4500) return { level: 12, name: "Mythic Artist 🔱" };
    if (points >= 3000) return { level: 11, name: "Drawing Hero 🦸‍♂️" };
    if (points >= 2300) return { level: 10, name: "Drawing Grand Master 🐐" };
    if (points >= 1700) return { level: 9, name: "Art Wizard 🧙‍♂️" };
    if (points >= 1200) return { level: 8, name: "Drawing Legend 👑" };
    if (points >= 800) return { level: 7, name: "Visionary Artist 🖼️" };
    if (points >= 500) return { level: 6, name: "Master Doodler 🧑‍🎨" };
    if (points >= 300) return { level: 5, name: "Artistic Talent 🖌️" };
    if (points >= 100) return { level: 4, name: "Creative Explorer 🎨" };
    if (points >= 50) return { level: 3, name: "Drawing Enthusiast ✒️" };
    if (points >= 10) return { level: 2, name: "Sketch Apprentice ✏️" };
    return { level: 1, name: "Novice Artist 🖍️" };
  };

  // Modify updateUserStreak to handle streak points
  const updateUserStreak = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log('User document does not exist');
        return;
      }

      const userData = userDoc.data();
      const now = new Date();
      const lastStreakDate = userData.lastStreakDate?.toDate();
      
      // Initialize streak and streakPoints from existing values
      let streak = userData.streak !== undefined ? userData.streak : 1;
      let streakPoints = userData.streakPoints !== undefined ? userData.streakPoints : 1;

      console.log('Current streak data:', { lastStreakDate, streak, streakPoints });

      // Check if we should increment streak (if lastStreakDate is not today)
      const shouldIncrement = !lastStreakDate || 
        lastStreakDate.getDate() !== now.getDate() || 
        lastStreakDate.getMonth() !== now.getMonth() || 
        lastStreakDate.getFullYear() !== now.getFullYear();

      if (shouldIncrement) {
        console.log('Incrementing streak...');
        // Check if the last activity was yesterday (to continue streak)
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const isConsecutiveDay = lastStreakDate && 
          lastStreakDate.getDate() === yesterday.getDate() &&
          lastStreakDate.getMonth() === yesterday.getMonth() &&
          lastStreakDate.getFullYear() === yesterday.getFullYear();

        if (isConsecutiveDay) {
          // Continue streak - always increment by 1
          streak = streak + 1;
          if (streakPoints < 20) {
            streakPoints = streakPoints + 1;
          }
        } else {
          // Reset streak if not consecutive
          streak = 1;
          streakPoints = 1;
        }
      } else {
        console.log('User already seen today, keeping current values');
      }

      // Only add streak points to total points if it's a new day
      const totalPoints = shouldIncrement ? 
        (userData.points || 0) + streakPoints : 
        (userData.points || 0);

      console.log('Final values before update:', {
        streak,
        streakPoints,
        totalPoints,
        lastStreakDate: shouldIncrement ? now.toISOString() : lastStreakDate?.toISOString()
      });

      // Update user document with new streak, streak points, and total points
      await setDoc(userRef, {
        streak,
        streakPoints,
        points: totalPoints,
        lastSeen: now,
        lastStreakDate: shouldIncrement ? now : lastStreakDate  // Only update lastStreakDate if we incremented
      }, { merge: true });

      console.log('Updated user streak in Firestore:', { userId, streak, streakPoints, totalPoints });

      // Update local state if we're showing profile
      if (showProfile) {
        setUserStats(prev => prev ? {
          ...prev,
          streak,
          streakPoints,
          points: totalPoints
        } : null);
      }

      return { streak, streakPoints };
    } catch (error) {
      console.error('Error updating user streak:', error);
      return { streak: 0, streakPoints: 0 };
    }
  };

  const fetchUserStats = async (fid: number) => {
    try {
      const userRef = doc(db, 'users', fid.toString());
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        return {
          correctGuesses: data.correctGuesses || 0,
          points: data.points || 0,
          created: data.created || 0,
          gameSolutions: data.gameSolutions || 0,
          isEarlyAdopter: data.isEarlyAdopter || false,
          streak: data.streak || 0,
          streakPoints: data.streakPoints || 0,
          isCoined: data.isCoined || false,
          weeklyWins: data.weeklyWins || 0,
          weeklyTopDrawer: data.weeklyTopDrawer || 0,
          weeklyTopGuesser: data.weeklyTopGuesser || 0,
          weeklyPoints: data.weeklyPoints || 0,
          dailyGamesCreated: data.dailyGamesCreated || 0,
          dailyShared: data.dailyShared || 0,
          dailyCorrectGuesses: data.dailyCorrectGuesses || 0,
          dailyQuests: data.dailyQuests || 0,
          isDailyQuestCompleted: data.isDailyQuestCompleted || false,
          isPremium: data.isPremium || false
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return null;
    }
  };

  const renderProfile = () => {
    const isAdmin = context?.user?.fid === 234692; // Hardcoded admin FID for now

    return (
      <div>
        {/* Profile Image */}
        <div className="flex justify-center mb-6">
          {context?.user?.pfpUrl && (
            <Image 
              src={context.user.pfpUrl} 
              alt="Profile" 
              width={96} 
              height={96} 
              className="rounded-full transform rotate-[-2deg] border-4 border-dashed border-gray-400"
            />
          )}
        </div>

        {/* Username and Share Button */}
        <div className="flex items-center justify-center gap-4 mb-2">
          <h2 className="text-xl font-bold text-gray-800 transform rotate-[1deg] flex items-center gap-2">
            {context?.user?.username || 'Anonymous'}
            {userStats?.isPremium && (
              <div className="relative group">
                <Image 
                  src="/Premium.png" 
                  alt="Premium" 
                  width={24} 
                  height={24} 
                  className="rounded-full transform rotate-[-2deg] cursor-help"
                  title="Premium User"
                  priority
                  quality={75}
                  unoptimized
                />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  Premium User
                </div>
              </div>
            )}
          </h2>
          {isAdmin && (
            <button
              onClick={async () => {
                if (context?.user?.fid) {
                  try {
                    // Generate and store the share image first
                    const response = await fetch('/api/generate-profile-share-image', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ userId: context.user.fid.toString() }),
                    });

                    if (!response.ok) {
                      throw new Error('Failed to generate share image');
                    }

                    // Open the profile URL in a new tab
                    const profileUrl = `${window.location.origin}/profile/${context.user.fid}`;
                    window.open(profileUrl, '_blank');
                  } catch (error) {
                    console.error('Error generating share image:', error);
                    // Still open the profile URL even if share image generation fails
                    const profileUrl = `${window.location.origin}/profile/${context.user.fid}`;
                    window.open(profileUrl, '_blank');
                  }
                }
              }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded-md text-sm transform rotate-[-1deg] transition-colors"
            >
              Share Profile
            </button>
          )}
        </div>

        {/* Level Display */}
        {userStats && (
          <div className="text-center mb-4 text-gray-600 transform rotate-[-1deg]">
            Level {getLevelInfo(userStats.points || 0).level}: {getLevelInfo(userStats.points || 0).name}
          </div>
        )}

        {/* Badges Section */}
        <div className="mb-6">
          <div className="flex justify-center gap-2 flex-wrap">
            {/* Early Adopter Badge */}
            {userStats?.isEarlyAdopter && (
              <div className="bg-red-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-red-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/OGbadge.png" 
                      alt="Early Adopter" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help"
                      title="OG user"
                      priority
                      quality={75}
                      unoptimized
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      OG user
                    </div>
                    <p className="text-xs text-gray-600">OG</p>
                  </div>
                </div>
              </div>
            )}
            {/* Coined Badge */}
            {userStats?.isCoined ? (
              <div className="bg-yellow-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-yellow-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/coinerbadge.png" 
                      alt="Coined a drawing" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help"
                      title="Coined a drawing"
                      priority
                      quality={75}
                      unoptimized
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Coined a drawing
                    </div>
                    <p className="text-xs text-gray-600">Coin</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-gray-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/coinerbadge.png" 
                      alt="Coiner (Locked)" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help grayscale"
                      title="Coin a drawing to unlock this badge"
                      priority
                      quality={75}
                      unoptimized
                      style={{ opacity: 0.5 }}
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Coin a drawing on the Collect page <br /> to unlock this badge!
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Weekly Winner Badge */}
            {userStats?.weeklyWins && userStats.weeklyWins > 0 ? (
              <div className="bg-purple-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-purple-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/weeklyTop.png" 
                      alt="Weekly Winner" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help"
                      title="Weekly Winner"
                      priority
                      quality={75}
                      unoptimized
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Weekly Winner
                    </div>
                    <p className="text-xs text-gray-600">x{userStats.weeklyWins}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-gray-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/weeklyTop.png" 
                      alt="Weekly Winner (Locked)" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help grayscale"
                      title="Become the top scorer of the week to unlock this badge"
                      priority
                      quality={75}
                      unoptimized
                      style={{ opacity: 0.5 }}
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Earn the most points of the week <br /> to unlock this badge!
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Weekly Top Drawer Badge */}
            {userStats?.weeklyTopDrawer && userStats.weeklyTopDrawer > 0 ? (
              <div className="bg-blue-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-blue-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/topDrawer.png" 
                      alt="Weekly Top Drawer" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help"
                      title="Weekly Top Drawer"
                      priority
                      quality={75}
                      unoptimized
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Weekly Top Drawer
                    </div>
                    <p className="text-xs text-gray-600">x{userStats.weeklyTopDrawer}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-gray-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/topDrawer.png" 
                      alt="Weekly Top Drawer (Locked)" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help grayscale"
                      title="Become the top drawer of the week to unlock this badge"
                      priority
                      quality={75}
                      unoptimized
                      style={{ opacity: 0.5 }}
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Become the top drawer of the week <br /> to unlock this badge!
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Weekly Top Guesser Badge */}
            {userStats?.weeklyTopGuesser && userStats.weeklyTopGuesser > 0 ? (
              <div className="bg-green-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-green-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/topGuesser.png" 
                      alt="Weekly Top Guesser" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help"
                      title="Weekly Top Guesser"
                      priority
                      quality={75}
                      unoptimized
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Weekly Top Guesser
                    </div>
                    <p className="text-xs text-gray-600">x{userStats.weeklyTopGuesser}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-100 p-1 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-gray-400">
                <div className="flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/topGuesser.png" 
                      alt="Weekly Top Guesser (Locked)" 
                      width={32} 
                      height={32} 
                      className="rounded-full transform rotate-[-2deg] cursor-help grayscale"
                      title="Become the top guesser of the week to unlock this badge"
                      priority
                      quality={75}
                      unoptimized
                      style={{ opacity: 0.5 }}
                    />
                    <div className="absolute bottom-full left-3/4 transform -translate-x-3/4 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      Become the top guesser of the week <br /> to unlock this badge!
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Premium Plan Box */}
        {!userStats?.isPremium && (
          <div className="bg-gray-100 p-4 rounded-lg border-2 border-[#FFC024] transition-colors mb-6 transform rotate-[1deg] border-dashed">
            <div className="flex justify-between items-start">
              <div className="text-center w-full">
                <h3 className="font-bold text-lg">Upgrade to Premium</h3>
                <div className="text-sm text-gray-600 mt-1">
                  <ul className="space-y-1">
                    <li className="flex items-center gap-2">
                      <span>✓</span>
                      <span>Colored drawings</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span>✓</span>
                      <span>Premium badge</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span>✓</span>
                      <span>Support the app</span>
                    </li>
                  </ul>
                </div>
                <div className="mt-4">
                  <DaimoPayButton.Custom
                    appId="pay-glow-P36FYozSc24Ea6r75i8BAq"
                    toChain={baseUSDC.chainId}
                    toUnits="2.99"
                    toToken={getAddress(baseUSDC.token)}
                    toAddress="0xAbE4976624c9A6c6Ce0D382447E49B7feb639565"
                    metadata={{
                      name: "drawcast",
                    }}
                    onPaymentStarted={(e) => {
                      if (analytics) {
                        logEvent(analytics, 'premium_button_click');
                      }
                      console.log(e);
                    }}
                    onPaymentCompleted={async (e) => {
                      console.log(e);
                      if (context?.user?.fid) {
                        try {
                          const userRef = doc(db, 'users', context.user.fid.toString());
                          const userDoc = await getDoc(userRef);
                          const userData = userDoc.data();
                          
                          let newDeactivationDate;
                          if (userData?.premiumDeactivatedAt) {
                            const currentDeactivation = new Date(userData.premiumDeactivatedAt);
                            newDeactivationDate = new Date(currentDeactivation.getTime() + (30 * 24 * 60 * 60 * 1000));
                          } else {
                            const now = new Date();
                            newDeactivationDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
                          }

                          await updateDoc(userRef, {
                            isPremium: true,
                            everPremium: true,
                            premiumActivatedAt: new Date().toISOString(),
                            premiumDeactivatedAt: newDeactivationDate.toISOString()
                          });
                          
                          // Track premium upgrade event
                          if (analytics) {
                            logEvent(analytics, 'premium_upgrade');
                          }
                          
                          // Refresh user stats
                          const updatedStats = await fetchUserStats(context.user.fid);
                          setUserStats(updatedStats);
                        } catch (error) {
                          console.error('Error updating premium status:', error);
                        }
                      }
                    }}
                    paymentOptions={["Coinbase"]}
                    preferredChains={[8453]}
                  >
                    {({ show }) => (
                      <button 
                        onClick={show} 
                        className="bg-[#FFC024] text-black px-6 py-2 rounded-md hover:bg-[#FFB800] transition-colors font-medium text-sm transform rotate-[-1deg]"
                      >
                        $2.99/month
                      </button>
                    )}
                  </DaimoPayButton.Custom>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Premium Expiration Notice */}
        {userStats?.isPremium && premiumExpirationDays !== null && premiumExpirationDays <= 3 && premiumExpirationDays > 0 && (
          <div className="bg-yellow-100 p-4 rounded-lg mb-6 transform rotate-[-1deg] border-2 border-dashed border-yellow-400">
            <div className="flex flex-col items-center justify-center gap-3">
              <span className="text-black">Your premium expires in {premiumExpirationDays} {premiumExpirationDays === 1 ? 'day' : 'days'}</span>
              <DaimoPayButton.Custom
                appId="pay-glow-P36FYozSc24Ea6r75i8BAq"
                toChain={baseUSDC.chainId}
                toUnits="3.99"
                toToken={getAddress(baseUSDC.token)}
                toAddress="0xAbE4976624c9A6c6Ce0D382447E49B7feb639565"
                metadata={{
                  name: "drawcast",
                }}
                onPaymentStarted={(e) => {
                  if (analytics) {
                    logEvent(analytics, 'clicked_renew_premium');
                  }
                  console.log(e);
                }}
                onPaymentCompleted={async (e) => {
                  console.log(e);
                  if (context?.user?.fid) {
                    try {
                      const userRef = doc(db, 'users', context.user.fid.toString());
                      const userDoc = await getDoc(userRef);
                      const userData = userDoc.data();
                      
                      let newDeactivationDate;
                      if (userData?.premiumDeactivatedAt) {
                        const currentDeactivation = new Date(userData.premiumDeactivatedAt);
                        newDeactivationDate = new Date(currentDeactivation.getTime() + (30 * 24 * 60 * 60 * 1000));
                      } else {
                        const now = new Date();
                        newDeactivationDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
                      }

                      await updateDoc(userRef, {
                        isPremium: true,
                        everPremium: true,
                        premiumActivatedAt: new Date().toISOString(),
                        premiumDeactivatedAt: newDeactivationDate.toISOString()
                      });
                      
                      // Refresh user stats
                      const updatedStats = await fetchUserStats(context.user.fid);
                      setUserStats(updatedStats);
                    } catch (error) {
                      console.error('Error updating premium status:', error);
                    }
                  }
                }}
                paymentOptions={["Coinbase"]}
                preferredChains={[8453]}
              >
                {({ show }) => (
                  <button 
                    onClick={show} 
                    className="bg-[#FFC024] text-black px-6 py-2 rounded-md hover:bg-[#FFB800] transition-colors font-medium text-sm transform rotate-[-1deg]"
                  >
                    Renew Now
                  </button>
                )}
              </DaimoPayButton.Custom>
            </div>
          </div>
        )}

        {/* Simplified Stats Box */}
        <div className="bg-gray-100 p-4 rounded-lg mb-6 transform rotate-[-1deg] border-2 border-dashed border-gray-400">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">Overall Rank:</span>
              <span>{leaderboardData.currentUser?.pointsRank ? `#${leaderboardData.currentUser.pointsRank}` : 'Not ranked'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Points:</span>
              <span>{userStats?.points || 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">Day Streaks:</span>
              <span>{userStats?.streak || 0} 🔥</span>
            </div>
          </div>
        </div>

        {/* Rank Boxes */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[2deg] border-2 border-dashed border-gray-400">

            <div className="text-2xl font-bold text-gray-800">
              {leaderboardData.currentUser?.drawersRank ? `#${leaderboardData.currentUser.drawersRank}` : '-'}
            </div>
            <div className="text-sm text-gray-600 mb-1">Drawer Rank</div>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[-2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.gameSolutions || 0}
            </div>
            <div className="text-sm text-gray-600">
              Game solutions
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[-2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {leaderboardData.currentUser?.guessersRank ? `#${leaderboardData.currentUser.guessersRank}` : '-'}
            </div>
            <div className="text-sm text-gray-600 mb-1">Guesser Rank</div>

          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.correctGuesses || 0}
            </div>
            <div className="text-sm text-gray-600">
              Correct guesses
            </div>
          </div>

        </div>

        {/* Created Games Section */}
        <div className="mb-6">
          <button
            onClick={() => setIsDrawingsExpanded(!isDrawingsExpanded)}
            className="w-full flex justify-between items-center p-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors transform rotate-[-1deg] border-2 border-dashed border-gray-400"
          >
            <h3 className="text-lg font-bold text-gray-800">My Drawings</h3>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transform transition-transform ${isDrawingsExpanded ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          
          {isDrawingsExpanded && (
            <div className="mt-2">
              {isLoadingGames ? (
                <div className="text-center text-gray-800 p-4 transform rotate-[2deg]">
                  Loading your drawings...
                </div>
              ) : (
                <div className="space-y-2">
                  {createdGames.map((game, index) => (
                    <button 
                      key={game.id}
                      onClick={() => setSelectedDrawing(game)}
                      className={`w-full p-4 rounded-lg transform rotate-${index % 2 === 0 ? '[-1deg]' : '[1deg]'} border-2 border-dashed border-gray-400 hover:bg-gray-200 transition-colors`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-gray-800">
                            {game.prompt}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Created {new Date(game.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {game.totalGuesses}/10 players
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-gray-800">
                            {game.totalGuesses} guesses
                          </div>
                          <div className="text-sm text-green-800">
                            {game.correctGuesses} correct
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {createdGames.length === 0 && (
                    <div className="text-center text-gray-800 p-4 transform rotate-[1deg]">
                      No drawings created yet
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Fetch leaderboard data
  useEffect(() => {
    const fetchLeaderboardData = async () => {
      if (!context?.user?.fid) return;

      try {
        setIsLoadingLeaderboard(true);
        // Fetch all users
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        
        // Process users
        const users = usersSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            fid: parseInt(doc.id),
            username: data.username || 'Anonymous',
            pfpUrl: data.pfpUrl || '',
            points: data.points || 0,
            isPremium: data.isPremium || false,
            isEarlyAdopter: data.isEarlyAdopter || false,
            isCoined: data.isCoined || false,
            gameSolutions: data.gameSolutions || 0,
            correctGuesses: data.correctGuesses || 0,
            weeklyPoints: data.weeklyPoints || 0,
            weeklyGameSolutions: data.weeklyGameSolutions || 0,
            weeklyCorrectGuesses: data.weeklyCorrectGuesses || 0
          };
        });

        // Sort users based on active time period and tab
        let sortedUsers: LeaderboardUser[];
        if (activeTimePeriodTab === 'weekly') {
          switch (activeLeaderboardTab) {
            case 'points':
              sortedUsers = users.sort((a, b) => (b.weeklyPoints || 0) - (a.weeklyPoints || 0));
              break;
            case 'drawers':
              sortedUsers = users.sort((a, b) => (b.weeklyGameSolutions || 0) - (a.weeklyGameSolutions || 0));
              break;
            case 'guessers':
              sortedUsers = users.sort((a, b) => (b.weeklyCorrectGuesses || 0) - (a.weeklyCorrectGuesses || 0));
              break;
            default:
              sortedUsers = users.sort((a, b) => (b.weeklyPoints || 0) - (a.weeklyPoints || 0));
          }
        } else {
          switch (activeLeaderboardTab) {
            case 'points':
              sortedUsers = users.sort((a, b) => b.points - a.points);
              break;
            case 'drawers':
              sortedUsers = users.sort((a, b) => (b.gameSolutions || 0) - (a.gameSolutions || 0));
              break;
            case 'guessers':
              sortedUsers = users.sort((a, b) => (b.correctGuesses || 0) - (a.correctGuesses || 0));
              break;
            default:
              sortedUsers = users.sort((a, b) => b.points - a.points);
          }
        }

        // Add rank to each user
        const rankedUsers = sortedUsers.map((user: LeaderboardUser, index: number) => ({
          ...user,
          rank: index + 1
        }));

        // Find current user
        const currentUser = rankedUsers.find(user => user.fid === context.user.fid) || null;

        // Get top 10 users
        const topUsers = rankedUsers.slice(0, 10);

        setLeaderboardData({
          topUsers,
          currentUser
        });

        // Check for level up if we have a current user
        if (currentUser) {
          const userRef = doc(db, 'users', context.user.fid.toString());
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const currentLevel = getLevelInfo(currentUser.points).level;
            const lastKnownLevel = userData.lastKnownLevel || 1;
            
            if (currentLevel > lastKnownLevel) {
              setNewLevelInfo(getLevelInfo(currentUser.points));
              setShowLevelUpModal(true);
              
              // Update lastKnownLevel in Firestore
              await setDoc(userRef, {
                lastKnownLevel: currentLevel
              }, { merge: true });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching leaderboard data:', error);
      } finally {
        setIsLoadingLeaderboard(false);
      }
    };

    if (showLeaderboard) {
      fetchLeaderboardData();
    }
  }, [showLeaderboard, context?.user?.fid, db, activeTimePeriodTab, activeLeaderboardTab]);

  const renderLeaderboard = () => {
    // Sort users based on active tab
    const sortedUsers = [...leaderboardData.topUsers].sort((a, b) => {
      if (activeTimePeriodTab === 'weekly') {
        switch (activeLeaderboardTab) {
          case 'points':
            return (b.weeklyPoints || 0) - (a.weeklyPoints || 0);
          case 'drawers':
            return (b.weeklyGameSolutions || 0) - (a.weeklyGameSolutions || 0);
          case 'guessers':
            return (b.weeklyCorrectGuesses || 0) - (a.weeklyCorrectGuesses || 0);
          default:
            return (b.weeklyPoints || 0) - (a.weeklyPoints || 0);
        }
      } else {
        switch (activeLeaderboardTab) {
          case 'points':
            return b.points - a.points;
          case 'drawers':
            return (b.gameSolutions || 0) - (a.gameSolutions || 0);
          case 'guessers':
            return (b.correctGuesses || 0) - (a.correctGuesses || 0);
          default:
            return b.points - a.points;
        }
      }
    });

    return (
      <div>
        {/* Time Period Tabs */}
        <div className="flex gap-2 mb-4 mt-4">
          <button
            onClick={() => setActiveTimePeriodTab('weekly')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-1deg] border-2 border-dashed ${
              activeTimePeriodTab === 'weekly' 
                ? 'bg-[#0c703b] text-white border-white' 
                : 'bg-gray-100 text-gray-600 border-gray-400'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setActiveTimePeriodTab('all-time')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[1deg] border-2 border-dashed ${
              activeTimePeriodTab === 'all-time' 
                ? 'bg-[#0c703b] text-white border-white' 
                : 'bg-gray-100 text-gray-600 border-gray-400'
            }`}
          >
            All-time
          </button>
        </div>

        {isLoadingLeaderboard ? (
          <div className="text-center text-gray-600">
            Loading...
          </div>
        ) : (
          <>
            {activeTimePeriodTab === 'weekly' ? (
              <>
                {/* Category Tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveLeaderboardTab('points')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-1deg] border-2 border-dashed ${
                      activeLeaderboardTab === 'points' 
                        ? 'bg-[#0c703b] text-white border-white' 
                        : 'bg-gray-100 text-gray-600 border-gray-400'
                    }`}
                  >
                    🏆
                  </button>
                  <button
                    onClick={() => setActiveLeaderboardTab('drawers')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[1deg] border-2 border-dashed ${
                      activeLeaderboardTab === 'drawers' 
                        ? 'bg-[#0c703b] text-white border-white' 
                        : 'bg-gray-100 text-gray-600 border-gray-400'
                    }`}
                  >
                    Drawers
                  </button>
                  <button
                    onClick={() => setActiveLeaderboardTab('guessers')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-2deg] border-2 border-dashed ${
                      activeLeaderboardTab === 'guessers' 
                        ? 'bg-[#0c703b] text-white border-white' 
                        : 'bg-gray-100 text-gray-600 border-gray-400'
                    }`}
                  >
                    Guessers
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Show current user's position if they exist */}
                  {leaderboardData.currentUser && (
                    <div 
                      className="p-3 bg-green-100 rounded-lg flex items-center gap-3 transform rotate-[1deg] border-2 border-dashed border-gray-400"
                    >
                      <div className="text-lg font-bold w-8">{leaderboardData.currentUser.rank}</div>
                      {leaderboardData.currentUser.pfpUrl && (
                        <Image 
                          src={leaderboardData.currentUser.pfpUrl} 
                          alt={leaderboardData.currentUser.username} 
                          width={32} 
                          height={32} 
                          className="rounded-full transform rotate-[-2deg]"
                          quality={75}
                          unoptimized
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-bold flex items-center gap-2">
                          {leaderboardData.currentUser.username}
                          {leaderboardData.currentUser.isCoined && (
                            <div className="relative group">
                              <Image 
                                src="/coinerbadge.png" 
                                alt="Coined a drawing" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Coined a drawing"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Coined a drawing
                              </div>
                            </div>
                          )}
                          {leaderboardData.currentUser.isPremium && (
                            <div className="relative group">
                              <Image 
                                src="/premium.png" 
                                alt="Premium User" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Premium user"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Premium user
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {activeLeaderboardTab === 'points' && `${activeTimePeriodTab === 'weekly' ? (leaderboardData.currentUser.weeklyPoints || 0) : leaderboardData.currentUser.points} points`}
                          {activeLeaderboardTab === 'drawers' && `${activeTimePeriodTab === 'weekly' ? (leaderboardData.currentUser.weeklyGameSolutions || 0) : (leaderboardData.currentUser.gameSolutions || 0)} solutions`}
                          {activeLeaderboardTab === 'guessers' && `${activeTimePeriodTab === 'weekly' ? (leaderboardData.currentUser.weeklyCorrectGuesses || 0) : (leaderboardData.currentUser.correctGuesses || 0)} correct guesses`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add a divider if current user is shown */}
                  {leaderboardData.currentUser && (
                    <div className="border-t-2 border-dashed border-gray-400 my-2"></div>
                  )}

                  {/* Show top users */}
                  {sortedUsers.map((user, index) => (
                    <div 
                      key={user.fid}
                      className={`p-3 rounded-lg flex items-center gap-3 transform rotate-${index % 2 === 0 ? '[-1deg]' : '[1deg]'} ${
                        context?.user?.fid === user.fid 
                          ? 'bg-green-100' 
                          : 'bg-gray-100'
                        } border-2 border-dashed border-gray-400`}
                    >
                      <div className="text-lg font-bold w-8">{index + 1}</div>
                      {user.pfpUrl && (
                        <Image 
                          src={user.pfpUrl} 
                          alt={user.username} 
                          width={32} 
                          height={32} 
                          className="rounded-full transform rotate-[2deg]"
                          quality={75}
                          unoptimized
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-bold flex items-center gap-2">
                          {user.username}
                          {user.isCoined && (
                            <div className="relative group">
                              <Image 
                                src="/coinerbadge.png" 
                                alt="Coined a drawing" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Coined a drawing"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Coined a drawing
                              </div>
                            </div>
                          )}
                          {user.isPremium && (
                            <div className="relative group">
                              <Image 
                                src="/premium.png" 
                                alt="Premium User" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Premium user"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Premium user
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {activeLeaderboardTab === 'points' && `${user.weeklyPoints || 0} points`}
                          {activeLeaderboardTab === 'drawers' && `${user.weeklyGameSolutions || 0} solutions`}
                          {activeLeaderboardTab === 'guessers' && `${user.weeklyCorrectGuesses || 0} correct guesses`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Category Tabs */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setActiveLeaderboardTab('points')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-1deg] border-2 border-dashed ${
                      activeLeaderboardTab === 'points' 
                        ? 'bg-[#0c703b] text-white border-white' 
                        : 'bg-gray-100 text-gray-600 border-gray-400'
                    }`}
                  >
                    🏆
                  </button>
                  <button
                    onClick={() => setActiveLeaderboardTab('drawers')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[1deg] border-2 border-dashed ${
                      activeLeaderboardTab === 'drawers' 
                        ? 'bg-[#0c703b] text-white border-white' 
                        : 'bg-gray-100 text-gray-600 border-gray-400'
                    }`}
                  >
                    Drawers
                  </button>
                  <button
                    onClick={() => setActiveLeaderboardTab('guessers')}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-2deg] border-2 border-dashed ${
                      activeLeaderboardTab === 'guessers' 
                        ? 'bg-[#0c703b] text-white border-white' 
                        : 'bg-gray-100 text-gray-600 border-gray-400'
                    }`}
                  >
                    Guessers
                  </button>
                </div>

                <div className="space-y-2">
                  {/* Show current user's position if they exist */}
                  {leaderboardData.currentUser && (
                    <div 
                      className="p-3 bg-green-100 rounded-lg flex items-center gap-3 transform rotate-[1deg] border-2 border-dashed border-gray-400"
                    >
                      <div className="text-lg font-bold w-8">{leaderboardData.currentUser.rank}</div>
                      {leaderboardData.currentUser.pfpUrl && (
                        <Image 
                          src={leaderboardData.currentUser.pfpUrl} 
                          alt={leaderboardData.currentUser.username} 
                          width={32} 
                          height={32} 
                          className="rounded-full transform rotate-[-2deg]"
                          quality={75}
                          unoptimized
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-bold flex items-center gap-2">
                          {leaderboardData.currentUser.username}
                          {leaderboardData.currentUser.isCoined && (
                            <div className="relative group">
                              <Image 
                                src="/coinerbadge.png" 
                                alt="Coined a drawing" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Coined a drawing"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Coined a drawing
                              </div>
                            </div>
                          )}
                          {leaderboardData.currentUser.isPremium && (
                            <div className="relative group">
                              <Image 
                                src="/premium.png" 
                                alt="Premium User" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Premium user"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Premium user
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {activeLeaderboardTab === 'points' && `${leaderboardData.currentUser.points} points`}
                          {activeLeaderboardTab === 'drawers' && `${leaderboardData.currentUser.gameSolutions || 0} solutions`}
                          {activeLeaderboardTab === 'guessers' && `${leaderboardData.currentUser.correctGuesses || 0} correct guesses`}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Add a divider if current user is shown */}
                  {leaderboardData.currentUser && (
                    <div className="border-t-2 border-dashed border-gray-400 my-2"></div>
                  )}

                  {/* Show top users */}
                  {sortedUsers.map((user, index) => (
                    <div 
                      key={user.fid}
                      className={`p-3 rounded-lg flex items-center gap-3 transform rotate-${index % 2 === 0 ? '[-1deg]' : '[1deg]'} ${
                        context?.user?.fid === user.fid 
                          ? 'bg-green-100' 
                          : 'bg-gray-100'
                        } border-2 border-dashed border-gray-400`}
                    >
                      <div className="text-lg font-bold w-8">{index + 1}</div>
                      {user.pfpUrl && (
                        <Image 
                          src={user.pfpUrl} 
                          alt={user.username} 
                          width={32} 
                          height={32} 
                          className="rounded-full transform rotate-[2deg]"
                          quality={75}
                          unoptimized
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-bold flex items-center gap-2">
                          {user.username}
                          {user.isCoined && (
                            <div className="relative group">
                              <Image 
                                src="/coinerbadge.png" 
                                alt="Coined a drawing" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Coined a drawing"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Coined a drawing
                              </div>
                            </div>
                          )}
                          {user.isPremium && (
                            <div className="relative group">
                              <Image 
                                src="/premium.png" 
                                alt="Premium User" 
                                width={20} 
                                height={20} 
                                className="rounded-full transform rotate-[-2deg] cursor-help"
                                title="Premium user"
                              />
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Premium user
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {activeLeaderboardTab === 'points' && `${user.points} points`}
                          {activeLeaderboardTab === 'drawers' && `${user.gameSolutions || 0} solutions`}
                          {activeLeaderboardTab === 'guessers' && `${user.correctGuesses || 0} correct guesses`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  // Add function to check if canvas is empty
  const checkCanvasEmpty = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Check if all pixels are white (255, 255, 255)
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
        return false;
      }
    }
    return true;
  };

  // Add effect to check canvas emptiness on draw
  useEffect(() => {
    if (isDrawing && canvasRef.current) {
      const checkEmpty = () => {
        setIsCanvasEmpty(checkCanvasEmpty(canvasRef.current!));
      };

      // Check initially
      checkEmpty();

      // Add event listeners to check after drawing
      const canvas = canvasRef.current;
      canvas.addEventListener('mouseup', checkEmpty);
      canvas.addEventListener('touchend', checkEmpty);

      return () => {
        canvas.removeEventListener('mouseup', checkEmpty);
        canvas.removeEventListener('touchend', checkEmpty);
      };
    }
  }, [isDrawing]);

  const handleDrawingSubmit = async () => {
    if (isSubmitting) return; // Prevent double submission
    
    if (!canvasRef.current) {
      console.error('No canvas reference');
      return;
    }

    if (!context?.user?.fid) {
      console.error('No Farcaster user context');
      return;
    }

    try {
      setIsSubmitting(true);
      setIsUploading(true);
      
      // Stop the timer if it's running
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Ensure we're authenticated
      if (!auth.currentUser) {
        console.log('No authenticated user, signing in anonymously...');
        await signInAnonymously(auth);
        console.log('Successfully authenticated anonymously');
      }

      // Generate a unique filename for the drawing
      const timestamp = new Date().getTime();
      const randomString = Math.random().toString(36).substring(2, 8);
      const drawingFilename = `${context.user.fid.toString()}_${timestamp}_${randomString}.png`;
      const drawingPath = `drawings/${drawingFilename}`;
      
      // Get the canvas data and upload
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      const storageRef = ref(storage, drawingPath);
      
      console.log('Uploading drawing with filename:', drawingFilename);
      console.log('Current auth state:', auth.currentUser);
      
      await uploadString(storageRef, base64Data, 'base64', {
        contentType: 'image/png',
        customMetadata: {
          uploadedBy: context.user.fid.toString()
        }
      });

      // Get the download URL
      const imageUrl = await getDownloadURL(storageRef);
      console.log('Drawing uploaded successfully:', imageUrl);
      
      let shareImageUrl = 'https://drawcast.xyz/image.png'; // Default fallback URL
      
      // Generate share image using fid+timestamp format
      const shareImageFilename = `${context.user.fid.toString()}_${timestamp}.png`;
      try {
        console.log('Generating share image with filename:', shareImageFilename);
        shareImageUrl = await generateShareImage(imageUrl, shareImageFilename);
        console.log('Share image URL:', shareImageUrl);
      } catch (error) {
        console.error('Error generating share image:', error);
      }

      // Create game data
      const createdAt = new Date();
      const expiredAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

      const gameData = {
        createdAt,
        expiredAt,
        imageUrl: imageUrl,
        shareImageUrl: shareImageUrl,
        prompt: currentPrompt,
        userFid: context.user.fid.toString(),
        username: context.user.username || 'Anonymous',
        guesses: [],
        totalGuesses: 0,
        correctGuesses: 0
      };

      console.log('Creating game with data:', gameData);

      // Add the game document to Firestore and update user's gamesCreated count
      const batch = writeBatch(db);
      
      // Add game document
      const gamesRef = collection(db, 'games');
      const newGameRef = doc(gamesRef);
      batch.set(newGameRef, gameData);

      // Update user's gamesCreated count
      const userRef = doc(db, 'users', context.user.fid.toString());
      batch.update(userRef, {
        gamesCreated: increment(1),
        dailyGamesCreated: increment(1)
      });

      console.log('Committing batch...');
      await batch.commit();
      console.log('Batch committed successfully');
      
      // Track drawing submission event
      trackEvent('drawing_submitted');
      
      setLastCreatedGameId(newGameRef.id);
      setShowSharePopup(true);
      setIsDrawing(false); // Exit drawing mode after successful submission

      // After successful submission, send notifications to friends
      try {
        const userRef = doc(db, 'users', context.user.fid.toString());
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();

        // Only send notification if it hasn't been sent before
        if (!userData?.isFriendNotificationSent) {
          const gameUrl = `${window.location.origin}/game/${newGameRef.id}`;
          await fetch('/api/friend-notification', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fid: context.user.fid,
              username: context.user.username,
              gameUrl,
            }),
          });

          // Update the isFriendNotificationSent field
          await updateDoc(userRef, {
            isFriendNotificationSent: true
          });
        }
      } catch (error) {
        console.error('Failed to send friend notifications:', error);
        // Don't throw here - we don't want to affect the main flow if notifications fail
      }

    } catch (error) {
      console.error('Error uploading drawing or creating game:', error);
    } finally {
      setIsUploading(false);
      setIsSubmitting(false);
    }
  };

  // Update generateShareImage to use the same filename
  const generateShareImage = async (drawingUrl: string, filename: string): Promise<string> => {
    try {
      console.log('Starting share image generation with filename:', filename);
      
      if (!context?.user?.fid) {
        console.error('User not authenticated in generateShareImage');
        throw new Error('User not authenticated');
      }

      const requestBody = {
        drawingUrl,
        filename: filename,
        userId: context.user.fid.toString()
      };
      
      console.log('Sending request to API with body:', requestBody);
      console.log('Using FID for authentication:', context.user.fid.toString());
      
      const response = await fetch('/api/generate-share-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.user.fid.toString()}`
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API response error:', errorData);
        throw new Error(errorData.error || 'Failed to generate share image');
      }

      const data = await response.json();
      console.log('Share image generated:', data.shareImageUrl);
      return data.shareImageUrl;
    } catch (error) {
      console.error('Error in generateShareImage:', error);
      return 'https://drawcast.xyz/image.png';
    }
  };

  const handleShareToWarpcast = async () => {
    if (!lastCreatedGameId) return;
    
    // Create the game URL
    const gameUrl = `${window.location.origin}/games/${lastCreatedGameId}`;
    // Randomly select a cast text variation
    const randomCastText = castTextVariations[Math.floor(Math.random() * castTextVariations.length)];
    const castText = `${randomCastText}\n\nArtist: @${context?.user?.username || 'Anonymous'}\n\n${gameUrl}`;

    try {
      // Track share event
      trackEvent('drawing_shared');

      // Update daily shared count
      if (context?.user?.fid) {
        const userRef = doc(db, 'users', context.user.fid.toString());
        await updateDoc(userRef, {
          dailyShared: increment(1)
        });
      }

      // Open the compose window with the game URL
      await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(gameUrl)}`);
      setShowSharePopup(false);
    } catch (error) {
      console.error('Error sharing to Warpcast:', error);
    }
  };

  const renderDrawingPage = () => {
    return (
      <div 
        className="fixed inset-0 bg-[#f9f7f0]" 
        style={{ 
          paddingTop: "72px",
          paddingBottom: "64px",
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000
        }}
      >
        <div className="w-[300px] mx-auto px-2">
          <h1 className="text-2xl font-bold text-center mb-1 text-gray-600">Draw: {currentPrompt || 'Loading...'}</h1>
          <div className="text-center text-gray-600 mb-2">
            Time left: {timeLeft}s
          </div>

          {/* Color Picker */}
          <div className="p-1 rounded-lg mb-1 transform rotate-[-1deg] relative group">
            <div className="flex justify-center gap-1">
              {['black', 'red', 'blue', 'green', 'yellow', 'brown'].map((color) => (
                <button
                  key={color}
                  onClick={() => userStats?.isPremium ? setSelectedColor(color) : null}
                  className={`w-6 h-6 rounded-full border-2 ${
                    selectedColor === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                  } transition-transform ${userStats?.isPremium ? 'hover:scale-105' : 'opacity-50 cursor-not-allowed'}`}
                  style={{ backgroundColor: color }}
                  title={userStats?.isPremium ? color : 'Premium feature'}
                />
              ))}
            </div>
            {!userStats?.isPremium && (
              <>
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                  <div className="bg-gray-800 text-white px-2 py-1 rounded text-xs">
                    Upgrade to premium to use colors
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Drawing Canvas Area */}
          <div className="w-full aspect-square bg-white rounded-lg mb-2 border-2 border-gray-300 overflow-hidden select-none"
               style={{ touchAction: 'none' }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>
          
          <div className="space-y-2">

            <button 
              onClick={handleDrawingSubmit}
              disabled={isUploading || isCanvasEmpty}
              className="w-full bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed transform rotate-[-1deg] border-4 border-dashed border-white"
            >
              {isUploading ? 'Uploading...' : isCanvasEmpty ? 'Draw something to submit' : 'Submit'}
            </button>

            <button 
              onClick={handleStartNew}
              className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors transform rotate-[1deg] border-4 border-dashed border-white"
            >
              Start new
            </button>
          </div>
        </div>

        {/* Time Up Popup */}
        {showTimeUpPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-sm w-full mx-4">
              <h2 className="text-xl font-bold text-center mb-4 text-gray-600">Time is up!</h2>
              <p className="text-center mb-6 text-gray-800">Do you want to submit?</p>
              <div className="flex gap-4">
                <button
                  onClick={handleDrawingSubmit}
                  disabled={isSubmitting}
                  className="flex-1 bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors transform rotate-[-1deg] border-4 border-dashed border-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </button>
                <button
                  onClick={handleStartNew}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors transform rotate-[1deg] border-4 border-dashed border-white disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Start New
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Fetch games when guess page is shown
  const fetchGames = async (isInitial = true) => {
    try {
      if (isInitial) {
        setIsLoadingGames(true);
      } else {
        setIsLoadingMore(true);
      }

      const gamesRef = collection(db, 'games');
      let q = query(
        gamesRef,
        orderBy('createdAt', 'desc'),
        limit(GAMES_PER_PAGE)
      );

      // If not initial load and we have a last visible document, start after it
      if (!isInitial && lastVisible) {
        q = query(
          gamesRef,
          orderBy('createdAt', 'desc'),
          startAfter(lastVisible),
          limit(GAMES_PER_PAGE)
        );
      }

      const querySnapshot = await getDocs(q);
      
      // Update last visible document
      const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastVisible(lastDoc);
      
      // Check if we have more documents
      setHasMore(querySnapshot.docs.length === GAMES_PER_PAGE);

      const gamesData = await Promise.all(querySnapshot.docs.map(async (gameDoc: QueryDocumentSnapshot<DocumentData>) => {
        const gameData = gameDoc.data();
        const userDocRef = doc(db, 'users', gameData.userFid as string);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data() as { username?: string } | undefined;
        const username = userData?.username || 'Anonymous';
        
        return {
          id: gameDoc.id,
          imageUrl: gameData.imageUrl as string || '',
          prompt: gameData.prompt as string || '',
          createdAt: (gameData.createdAt as { toDate: () => Date }).toDate(),
          expiredAt: (gameData.expiredAt as { toDate: () => Date }).toDate(),
          userFid: gameData.userFid as string || '',
          username: username,
          guesses: gameData.guesses || [],
          totalGuesses: gameData.totalGuesses || 0,
          isBanned: gameData.isBanned || false
        };
      }));
      
      if (isInitial) {
        setGames(gamesData);
      } else {
        setGames(prev => [...prev, ...gamesData]);
      }
      
      // If we have an initialGameId, select that game
      if (isInitial && initialGameId) {
        const game = gamesData.find((g: { id: string }) => g.id === initialGameId);
        if (game) {
          setSelectedGame(game);
        }
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setIsLoadingGames(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (showGuess) {
      fetchGames(true);
    }
  }, [showGuess, db, initialGameId]);

  // Add intersection observer for infinite scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoadingGames) {
          fetchGames(false);
        }
      },
      { threshold: 0.1 }
    );

    const loadMoreTrigger = document.getElementById('load-more-trigger');
    if (loadMoreTrigger) {
      observer.observe(loadMoreTrigger);
    }

    return () => {
      if (loadMoreTrigger) {
        observer.unobserve(loadMoreTrigger);
      }
    };
  }, [hasMore, isLoadingMore, isLoadingGames, lastVisible]);

  const handleGuessSubmit = async () => {
    // Check authentication state
    if (!authState.isAuthenticated || !context?.user?.fid) {
      setGuessError('Please connect with Farcaster to make a guess');
      return;
    }

    if (!selectedGame || !currentGuess.trim()) return;

    try {
      setIsSubmittingGuess(true);
      setGuessError(null);
      
      const fid = context.user.fid.toString();
      
      // Check if user has already guessed this game
      const gameRef = doc(db, 'games', selectedGame.id);
      const gameDoc = await getDoc(gameRef);
      
      if (gameDoc.exists()) {
        const gameData = gameDoc.data();
        const existingGuess = gameData.guesses?.find(
          (guess: Guess) => guess.userId === fid
        );
        
        if (existingGuess) {
          setGuessError('You have already guessed this drawing');
          setCurrentGuess('');
          setIsSubmittingGuess(false);
          return;
        }
      }

      const isCorrect = currentGuess.trim().toLowerCase() === selectedGame.prompt.toLowerCase();
      const guess: Guess = {
        userId: fid,
        username: context.user.username || 'Anonymous',
        guess: currentGuess.trim().toLowerCase(),
        isCorrect,
        createdAt: new Date()
      };

      // Track correct guess event
      if (isCorrect) {
        trackEvent('correct_guess');
      } else {
        trackEvent('incorrect_guess');
      }

      // Use a batch to ensure atomicity
      const batch = writeBatch(db);

      // Always update the game document with the new guess
      batch.update(gameRef, {
        guesses: arrayUnion(guess),
        totalGuesses: increment(1),
        correctGuesses: isCorrect ? increment(1) : increment(0)
      });

      // If the guess is correct, update both the guesser's and creator's points
      if (isCorrect) {
        // First get the current values
        const guesserRef = doc(db, 'users', fid);
        const creatorRef = doc(db, 'users', selectedGame.userFid);
        
        // Update guesser's fields - increment points by 10 for correct guess
        batch.update(guesserRef, {
          correctGuesses: increment(1),
          points: increment(10),
          weeklyPoints: increment(10),
          weeklyCorrectGuesses: increment(1),
          dailyCorrectGuesses: increment(1)
        });

        // Update creator's fields - increment points by 10 for solution
        batch.update(creatorRef, {
          gameSolutions: increment(1),
          points: increment(10),
          weeklyPoints: increment(10),
          weeklyGameSolutions: increment(1)
        });
      }

      // Commit all updates
      await batch.commit();

      // Update the local state to show the result
      setSelectedGame(prev => prev ? {
        ...prev,
        guesses: [...(prev.guesses || []), guess]
      } : null);
      
      // Clear the input
      setCurrentGuess('');

      // Refresh the games list to get updated data
      try {
        const gamesRef = collection(db, 'games');
        const q = query(gamesRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const gamesData = await Promise.all(querySnapshot.docs.map(async (gameDoc) => {
          const gameData = gameDoc.data();
          const userDocRef = doc(db, 'users', gameData.userFid as string);
          const userDoc = await getDoc(userDocRef);
          const userData = userDoc.data() as { username?: string } | undefined;
          const username = userData?.username || 'Anonymous';
          
          return {
            id: gameDoc.id,
            imageUrl: gameData.imageUrl as string || '',
            prompt: gameData.prompt as string || '',
            createdAt: (gameData.createdAt as { toDate: () => Date }).toDate(),
            expiredAt: (gameData.expiredAt as { toDate: () => Date }).toDate(),
            userFid: gameData.userFid as string || '',
            username: username,
            guesses: gameData.guesses || [],
            totalGuesses: gameData.totalGuesses || 0,
            isBanned: gameData.isBanned || false
          };
        }));
        
        setGames(gamesData);
      } catch (error) {
        console.error('Error refreshing games list:', error);
      }
      
    } catch (error) {
      console.error('Error submitting guess:', error);
      setGuessError('Failed to submit guess. Please try again.');
    } finally {
      setIsSubmittingGuess(false);
    }
  };

  const formatTimeRemaining = (expiredAt: { toDate: () => Date } | Date) => {
    // Convert Firestore Timestamp to Date if needed
    const expirationDate = 'toDate' in expiredAt ? expiredAt.toDate() : expiredAt;
    const now = new Date();
    const diff = expirationDate.getTime() - now.getTime();
    
    if (diff <= 0) return { text: 'Game ended', isEnded: true };
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { text: `Game ends in ${hours}h ${minutes}m`, isEnded: false };
  };

  const renderGuessDetailPage = () => {
    if (!selectedGame) return null;

    // Check if current user has already guessed this game
    const userGuess = selectedGame.guesses?.find(
      (guess: Guess) => guess.userId === context?.user?.fid?.toString()
    );

    // Check if game has expired
    const isExpired = selectedGame.expiredAt.getTime() <= new Date().getTime() || selectedGame.totalGuesses >= 10;
    
    // Check if current user is the drawer
    const isDrawer = context?.user?.fid?.toString() === selectedGame.userFid;

    // Check if user is moderator
    const moderatorFids = [234692, 1049448]; // Add your new FID here
    const isModerator = context?.user?.fid && moderatorFids.includes(context.user.fid);

    // Find next unsolved drawing
    const findNextUnsolvedDrawing = () => {
      const unsolvedGames = games.filter(game => {
        const isExpired = game.expiredAt.getTime() <= new Date().getTime();
        const hasMaxGuesses = game.totalGuesses >= 10;
        const isOwnDrawing = game.userFid === context?.user?.fid?.toString();
        const hasGuessed = game.guesses?.some(
          (guess: Guess) => guess.userId === context?.user?.fid?.toString()
        );
        const isCurrentGame = game.id === selectedGame?.id;
        const isBanned = game.isBanned || false;
        return !isExpired && !hasMaxGuesses && !isOwnDrawing && !hasGuessed && !isCurrentGame && !isBanned;
      });

      if (unsolvedGames.length > 0) {
        // Get a random unsolved game
        const randomIndex = Math.floor(Math.random() * unsolvedGames.length);
        return unsolvedGames[randomIndex];
      }
      return null;
    };

    const handleNextDrawing = () => {
      setIsLoadingNextDrawing(true);
      setIsSubmittingGuess(false); // Reset the submitting state
      const nextGame = findNextUnsolvedDrawing();
      if (nextGame) {
        setSelectedGame(nextGame);
        setCurrentGuess('');
        setGuessError(null);
      } else {
        // If no more unsolved games, show a message
        setGuessError('No more drawings available to guess!');
      }
      // Add a small delay to show loading state
      setTimeout(() => {
        setIsLoadingNextDrawing(false);
      }, 500);
    };
    
    return (
      <div>
        <h1 className="text-2xl font-bold text-center mb-1 text-gray-600">Make your guess!</h1>
        <div className="text-center text-gray-600 mb-4">
          <p className="text-sm text-center text-gray-600 mb-4">You have only one chance.</p>
          
        </div>
        <div className="aspect-square relative bg-white rounded-lg overflow-hidden mb-2">
          {isLoadingNextDrawing ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <div className="text-gray-600 text-lg">Loading...</div>
            </div>
          ) : (
            <Image
              src={selectedGame.imageUrl}
              alt="Drawing to guess"
              width={500}
              height={500}
              className="object-contain"
              quality={75}
              priority
              sizes="(max-width: 768px) 100vw, 500px"
            />
          )}
        </div>
        <div className="text-center text-gray-600 mb-4 text-xs">
          Drawing by {selectedGame.username}. {selectedGame.totalGuesses}/10 players
        </div>
            
        <div className="space-y-4">
          {isExpired ? (
            <div className="p-4 rounded-lg text-center bg-red-100 text-red-800 mt-4">
              This game has ended
            </div>
          ) : isDrawer ? (
            <div className="p-4 rounded-lg text-center bg-blue-100 text-blue-800 mt-4">
              You created this drawing! Share it with others to earn points when they guess correctly.
            </div>
          ) : userGuess ? (
            <div className={`p-4 rounded-lg text-center ${
              userGuess.isCorrect 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              <p className="font-medium">You guessed: {userGuess.guess}</p>
              <p className="text-lg font-bold mt-2">
                {userGuess.isCorrect ? '✅ Correct! You earned 10 points.' : '❌ Wrong'}
              </p>
              {findNextUnsolvedDrawing() && (
                <button
                  onClick={handleNextDrawing}
                  className="mt-4 w-full bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors transform rotate-[-1deg] border-4 border-dashed border-white"
                >
                  Next Drawing →
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <input
                  type="text"
                  id="guess"
                  value={currentGuess}
                  onChange={(e) => setCurrentGuess(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Type your guess here..."
                  disabled={isSubmittingGuess}
                />
              </div>
              
              {guessError && (
                <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
                  {guessError}
                </div>
              )}
                  
              <button
                onClick={handleGuessSubmit}
                disabled={!currentGuess.trim() || isSubmittingGuess}
                className="w-full bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed transform rotate-[-1deg] border-4 border-dashed border-white"
              >
                {isSubmittingGuess ? 'Submitting...' : 'Submit Guess'}
              </button>

              {findNextUnsolvedDrawing() && (
                <button
                  onClick={handleNextDrawing}
                  className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors transform rotate-[1deg] border-4 border-dashed border-white mt-2"
                >
                  Next Drawing →
                </button>
              )}
            </>
          )}

          {isModerator && (
            <button
              onClick={async () => {
                try {
                  const gameRef = doc(db, 'games', selectedGame.id);
                  await setDoc(gameRef, { isBanned: true }, { merge: true });
                  setSelectedGame(null);
                  // Refresh the games list
                  const gamesRef = collection(db, 'games');
                  const q = query(gamesRef, orderBy('createdAt', 'desc'));
                  const querySnapshot = await getDocs(q);
                  const gamesData = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                      id: doc.id,
                      imageUrl: data.imageUrl,
                      prompt: data.prompt,
                      createdAt: data.createdAt.toDate(),
                      expiredAt: data.expiredAt.toDate(),
                      userFid: data.userFid,
                      username: data.username,
                      guesses: data.guesses || [],
                      totalGuesses: data.totalGuesses || 0,
                      isBanned: data.isBanned || false
                    };
                  });
                  setGames(gamesData);
                } catch (error) {
                  console.error('Error hiding drawing:', error);
                }
              }}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors transform rotate-[-1deg] border-2 border-dashed border-white mt-4"
            >
              Hide Drawing
            </button>
          )}

          {/* Share on Warpcast button */}
          {!isExpired && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={async () => {
                  const gameUrl = `${window.location.origin}/games/${selectedGame.id}`;
                  // Randomly select a cast text variation
                  const randomCastText = castTextVariations[Math.floor(Math.random() * castTextVariations.length)];
                  const castText = `${randomCastText}\n\nArtist: @${selectedGame.username}\n\n${gameUrl}`;
                  try {
                    // Track share event
                    trackEvent('drawing_shared');
                    
                    // Update daily shared count
                    if (context?.user?.fid) {
                      const userRef = doc(db, 'users', context.user.fid.toString());
                      await updateDoc(userRef, {
                        dailyShared: increment(1)
                      });
                    }
                    
                    await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(gameUrl)}`);
                  } catch (error) {
                    console.error('Error sharing to Warpcast:', error);
                  }
                }}
                className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 transform rotate-[2deg] border-4 border-dashed border-white"
              >
                <span>Share on Warpcast</span>
              </button>
              <button
                onClick={() => {
                  const gameUrl = `${window.location.origin}/games/${selectedGame.id}`;
                  navigator.clipboard.writeText(gameUrl);
                  // Show a temporary success message
                  const button = document.getElementById('copyLinkButton2');
                  if (button) {
                    const originalText = button.textContent;
                    button.textContent = 'Copied!';
                    setTimeout(() => {
                      if (button) button.textContent = originalText;
                    }, 2000);
                  }
                }}
                id="copyLinkButton2"
                className="w-full bg-gray-200 text-gray-600 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center gap-2 transform rotate-[-1deg] border-4 border-dashed border-white"
              >
                Copy game link
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGuessPage = () => {
    // Filter active games and exclude user's own drawings
    const activeGames = games.filter(game => {
      const isExpired = game.expiredAt.getTime() <= new Date().getTime();
      const hasMaxGuesses = game.totalGuesses >= 10;
      const isOwnDrawing = game.userFid === context?.user?.fid?.toString();
      const isBanned = game.isBanned || false;
      return !isExpired && !hasMaxGuesses && !isOwnDrawing && !isBanned;
    });

    // Filter games based on active tab
    const filteredGames = activeGames.filter(game => {
      const userGuess = game.guesses?.find(
        (guess: Guess) => guess.userId === context?.user?.fid?.toString()
      );

      switch (activeGuessTab) {
        case 'new':
          return !userGuess;
        case 'solved':
          return userGuess?.isCorrect;
        case 'wrong':
          return userGuess && !userGuess.isCorrect;
        default:
          return true;
      }
    });

    return (
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-l text-center mb-6 text-gray-600">Guess the drawings, earn points and climb the leaderboard!</h1>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveGuessTab('new')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-1deg] border-2 border-dashed ${
              activeGuessTab === 'new' 
                ? 'bg-[#0c703b] text-white border-white' 
                : 'bg-gray-100 text-gray-600 border-gray-400'
            }`}
          >
            New
          </button>
          <button
            onClick={() => setActiveGuessTab('solved')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[1deg] border-2 border-dashed ${
              activeGuessTab === 'solved' 
                ? 'bg-green-100 text-green-800 border-green-400' 
                : 'bg-gray-100 text-gray-600 border-gray-400'
            }`}
          >
            Solved
          </button>
          <button
            onClick={() => setActiveGuessTab('wrong')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors transform rotate-[-2deg] border-2 border-dashed ${
              activeGuessTab === 'wrong' 
                ? 'bg-red-100 text-red-800 border-red-400' 
                : 'bg-gray-100 text-gray-600 border-gray-400'
            }`}
          >
            Wrong
          </button>
        </div>

        {/* Quest Item */}
        <div className="mb-4">
          <button
            onClick={() => {
              trackEvent('daily_quest_opened');
              setShowQuest(true);
            }}
            disabled={isDailyQuestCompleted}
            className={`w-full p-4 rounded-lg transform rotate-[1deg] border-2 border-dashed border-gray-400 bg-white transition-colors ${
              isDailyQuestCompleted 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-gray-50 animate-glow'
            }`}
          >
            <div className="flex flex-row items-center justify-center gap-4">
              <Image src="/quest.png" alt="Quest" width={30} height={30} />
              <div className="flex flex-col flex-1 items-center">
                <div className="flex justify-center items-center mb-2 w-full">
                  <span className="text-gray-800 font-bold text-sm">
                    {isDailyQuestCompleted 
                      ? "Quest is completed!"
                      : "Quest: Earn 100 points!"
                    }
                  </span>
                </div>
                <div className="text-xs text-gray-600 text-center">
                  {isDailyQuestCompleted 
                    ? `Next quest in ${getQuestTimeInfo().hours}h ${getQuestTimeInfo().minutes}m`
                    : `Ends in ${getQuestTimeInfo().hours}h ${getQuestTimeInfo().minutes}m`
                  }
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="space-y-2">
          {isLoadingGames ? (
            <div className="text-center text-gray-600">
              Loading games...
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="text-center p-4 bg-gray-100 rounded-lg text-gray-600 transform rotate-[1deg] border-2 border-dashed border-gray-400">
              {activeGuessTab === 'new' && 'No new games to guess!'}
              {activeGuessTab === 'solved' && 'You haven\'t solved any games yet!'}
              {activeGuessTab === 'wrong' && 'You haven\'t made any wrong guesses yet!'}
            </div>
          ) : (
            <>
              {filteredGames.map((game) => {
                // Check if current user has already guessed this game
                const userGuess = game.guesses?.find(
                  (guess: Guess) => guess.userId === context?.user?.fid?.toString()
                );

                const timeInfo = formatTimeRemaining(game.expiredAt);

                return (
                  <button
                    key={game.id}
                    onClick={() => handleGameJoin(game.id)}
                    className={`w-full p-4 ${
                      userGuess 
                        ? userGuess.isCorrect
                          ? 'bg-green-100'
                          : 'bg-red-100'
                        : 'bg-gray-100 hover:bg-gray-200'
                    } rounded-lg text-left transition-colors transform rotate-${Math.random() > 0.5 ? '[1deg]' : '[-1deg]'} border-2 border-dashed border-gray-400`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-gray-600">
                          Drawing by {game.username}
                        </div>
                        <div className={`text-xs mt-1 ${timeInfo.isEnded ? 'text-red-600' : 'text-gray-500'}`}>
                          {timeInfo.text}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {game.totalGuesses}/10 players
                        </div>
                      </div>
                      {userGuess && (
                        <div className="text-sm font-medium">
                          {userGuess.isCorrect ? 'Solved' : 'Wrong'}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              
              {/* Load more trigger */}
              <div id="load-more-trigger" className="h-4 w-full">
                {isLoadingMore && (
                  <div className="text-center text-gray-600 py-2">
                    Loading more games...
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // Add WarpcastModal component
  const WarpcastModal = () => {
    const openInWarpcast = () => {
      const warpcastUrl = `https://warpcast.com/~/mini-apps/launch?url=https%3A%2F%2Fdrawcast.xyz`;
      // Open in new tab
      window.open(warpcastUrl, '_blank');
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-[#f9f7f0] p-6 rounded-lg max-w-sm w-full mx-4 relative border-4 border-dashed border-gray-400 transform rotate-[-1deg]">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-2 text-gray-800 transform rotate-[1deg]">Open in Warpcast</h2>
            <p className="text-gray-600 transform rotate-[-2deg]">
              To draw, guess, and earn points, please open this app in Warpcast.
            </p>
          </div>
          <button
            onClick={openInWarpcast}
            className="w-full bg-[#0c703b] text-white py-3 px-4 rounded-lg hover:bg-[#0c703b] transition-colors flex items-center justify-center gap-2 transform rotate-[2deg] border-4 border-dashed border-white"
          >
            <span>Open in Warpcast</span>
            <span>📱</span>
          </button>
        </div>
      </div>
    );
  };

  // Show Warpcast modal when there's no user context
  useEffect(() => {
    if (isSDKLoaded && !context?.user) {
      setShowWarpcastModal(true);
    } else {
      setShowWarpcastModal(false);
    }
  }, [isSDKLoaded, context?.user]);

  // Add authentication state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('User is signed in:', user.uid);
        setAuthState({
          isLoading: false,
          isAuthenticated: true,
          userId: user.uid,
          error: null
        });
      } else {
        console.log('No user is signed in');
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userId: null,
          error: null
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Add the LevelUpModal component
  const LevelUpModal = () => {
    if (!newLevelInfo) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-[#f9f7f0] p-6 rounded-lg max-w-sm w-full mx-4 relative border-4 border-dashed border-gray-400 transform rotate-[-1deg]">
          {/* Close button */}
          <button
            onClick={() => setShowLevelUpModal(false)}
            className="absolute top-2 right-2 text-gray-800 hover:text-gray-600 transform rotate-[2deg] border-2 border-dashed border-gray-400 px-2 py-1 rounded-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4 text-gray-800 transform rotate-[1deg]">Congrats! 🎉</h2>
            <p className="text-gray-600 mb-6 transform rotate-[-2deg]">
              You unlocked Level {newLevelInfo.level}!
            </p>
            <div className="text-xl font-bold text-gray-800 mb-6 transform rotate-[2deg]">
              {newLevelInfo.name}
            </div>
            
            <button
              onClick={async () => {
                const shareText = `I just reached Level ${newLevelInfo.level}: ${newLevelInfo.name} on drawcast.xyz`;
                try {
                  await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(shareText)}`);
                } catch (error) {
                  console.error('Error sharing to Warpcast:', error);
                }
              }}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 transform rotate-[2deg] border-4 border-dashed border-white"
            >
              Share on Warpcast
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Track page views
  useEffect(() => {
    if (isDrawing) {
      trackEvent('draw_page_view');
    } else if (showGuess) {
      trackEvent('game_list_view');
    } else if (showLeaderboard) {
      trackEvent('leaderboard_view');
    } else if (showProfile) {
      trackEvent('profile_view');
    }
  }, [isDrawing, showGuess, showLeaderboard, showProfile, trackEvent]);

  // Track draw button click
  const handleDrawClick = () => {
    trackEvent('draw_button_click');
    setIsDrawing(true);
    setShowTimeUpPopup(false);
    setTimeLeft(30);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  // Track game join
  const handleGameJoin = (gameId: string) => {
    trackEvent('game_joined', { gameId });
    setSelectedGame(games.find(g => g.id === gameId) || null);
  };

  // Add this function after the renderProfile function
  const renderDrawingDetails = () => {
    if (!selectedDrawing) return null;

    const isModerator = context?.user?.fid === 234692;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-[#f9f7f0] p-6 rounded-lg max-w-sm w-full mx-4 relative border-4 border-dashed border-gray-400 transform rotate-[-1deg] max-h-[90vh] flex flex-col">
          {/* Close button */}
          <button
            onClick={() => setSelectedDrawing(null)}
            className="absolute top-2 right-2 text-gray-800 hover:text-gray-600 transform rotate-[2deg] border-2 border-dashed border-gray-400 px-2 py-1 rounded-lg z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-gray-800 transform rotate-[1deg]">Drawing Details</h2>
            <p className="text-gray-600 transform rotate-[-2deg]">Prompt: {selectedDrawing.prompt}</p>
          </div>

          <div className="w-3/4 mx-auto aspect-square relative bg-white rounded-lg overflow-hidden mb-4">
            <Image
              src={selectedDrawing.imageUrl}
              alt="Drawing"
              width={400}
              height={400}
              className="object-contain"
              quality={75}
              priority
              sizes="(max-width: 768px) 100vw, 400px"
            />
          </div>

          {isModerator && (
            <button
              onClick={async () => {
                try {
                  const gameRef = doc(db, 'games', selectedDrawing.id);
                  await setDoc(gameRef, { isBanned: true }, { merge: true });
                  setSelectedDrawing(null);
                  // Refresh the games list
                  const gamesRef = collection(db, 'games');
                  const q = query(gamesRef, orderBy('createdAt', 'desc'));
                  const querySnapshot = await getDocs(q);
                  const gamesData = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                      id: doc.id,
                      imageUrl: data.imageUrl,
                      prompt: data.prompt,
                      createdAt: data.createdAt.toDate(),
                      expiredAt: data.expiredAt.toDate(),
                      userFid: data.userFid,
                      username: data.username,
                      guesses: data.guesses || [],
                      totalGuesses: data.totalGuesses || 0,
                      isBanned: data.isBanned || false
                    };
                  });
                  setGames(gamesData);
                } catch (error) {
                  console.error('Error hiding drawing:', error);
                }
              }}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition-colors transform rotate-[-1deg] border-2 border-dashed border-white mb-4"
            >
              Hide Drawing
            </button>
          )}

          <div className="overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <div className="text-sm text-gray-600">
                Created: {new Date(selectedDrawing.createdAt).toLocaleDateString()}
              </div>
              <div className="text-sm text-gray-600">
                Total Guesses: {selectedDrawing.totalGuesses}/10
              </div>
              <div className="text-sm text-gray-600">
                Correct Guesses: {selectedDrawing.correctGuesses}
              </div>
            </div>

            {selectedDrawing.guesses && selectedDrawing.guesses.length > 0 && (
              <div className="mt-4">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Guesses</h3>
                <div className="space-y-2">
                  {selectedDrawing.guesses.map((guess, index) => (
                    <div 
                      key={index}
                      className={`p-2 rounded-lg ${
                        guess.isCorrect ? 'bg-green-100' : 'bg-red-100'
                      } transform rotate-${index % 2 === 0 ? '[1deg]' : '[-1deg]'} border-2 border-dashed border-gray-400`}
                    >
                      <div className="text-sm font-medium">{guess.username}</div>
                      <div className="text-sm text-gray-600">Guessed: {guess.guess}</div>
                      <div className="text-sm font-medium">
                        {guess.isCorrect ? '✅ Correct' : '❌ Wrong'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCollection = () => {
    return (
      <div>
        <p className="text-l text-center mb-6 text-gray-600">
          Coin your drawings on Zora and <span className="font-bold">earn creator rewards!</span>
        </p>
        <p className="text-l text-center mb-6 text-gray-600 border-2 border-dashed border-blue-200 rounded-lg p-2 bg-blue-50 cursor-pointer" onClick={() => setShowZoraInfoModal(true)}>Details and troubleshooting</p>

        {showZoraInfoModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#f9f7f0] rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">How this works</h3>
                <button
                  onClick={() => setShowZoraInfoModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
        {isLoadingGames ? (
          <div className="text-center text-gray-600">
            Loading your drawings...
          </div>
        ) : createdGames.length === 0 ? (
          <div className="text-center p-4 bg-gray-100 rounded-lg text-gray-600 transform rotate-[1deg] border-2 border-dashed border-gray-400">
            You haven&apos;t created any drawings yet!
          </div>
        ) : (
          <div className="space-y-2">
            {createdGames.map((game, index) => (
              <div 
                key={game.id}
                className={`w-full p-4 rounded-lg transform rotate-${index % 2 === 0 ? '[-1deg]' : '[1deg]'} border-2 border-dashed border-gray-400 bg-white`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-24 h-16 relative bg-gray-100 rounded-lg overflow-hidden">
                    <Image
                      src={game.shareImageUrl || game.imageUrl}
                      alt={game.prompt}
                      width={96}
                      height={64}
                      className="object-cover"
                      quality={75}
                      unoptimized
                      loading="lazy"
                    />
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="text-xs text-gray-600">
                      Created {new Date(game.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex gap-2">
                      {!game.isMinted ? (
                        <button
                          onClick={async () => {
                            if (mintingGames.has(game.id)) return;
                            try {
                              trackEvent('coin_it_button_click');
                              setMintingGames(prev => new Set(prev).add(game.id));
                              console.log('Starting mint process for game:', game.id);
                              // Connect wallet first
                              if (!isSDKLoaded || !context) {
                                throw new Error('Farcaster Frame SDK not loaded');
                              }
                              // Get the wallet address using the SDK's wallet provider
                              const accounts = await sdk.wallet.ethProvider.request({ method: 'eth_requestAccounts' });
                              const userAddress = accounts[0];
                              if (!userAddress) {
                                throw new Error('Wallet connection required');
                              }
                              // Switch to Base network
                              try {
                                await sdk.wallet.ethProvider.request({
                                  method: 'wallet_switchEthereumChain',
                                  params: [{ chainId: '0x2105' }], // 8453 in hex
                                });
                              } catch (switchError: unknown) {
                                if (typeof switchError === 'object' && switchError !== null && 'code' in switchError && switchError.code === 4902) {
                                  try {
                                    await sdk.wallet.ethProvider.request({
                                      method: 'wallet_addEthereumChain',
                                      params: [{
                                        chainId: '0x2105',
                                        chainName: 'Base',
                                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                                        rpcUrls: ['https://mainnet.base.org'],
                                        blockExplorerUrls: ['https://basescan.org']
                                      }]
                                    });
                                  } catch (addError) {
                                    console.error('Failed to add Base network:', addError);
                                    throw new Error('Failed to add Base network to wallet');
                                  }
                                } else {
                                  throw new Error('Failed to switch to Base network');
                                }
                              }
                              // Prepare metadata
                              const metadata = {
                                name: `Drawcast: ${game.id}`,
                                description: `This is a(n) ${game.prompt} drawn by ${context?.user?.username || 'Anonymous'} on Drawcast.xyz. Join the fun, challenge friends and earn points: drawcast.xyz`,
                                image: game.shareImageUrl || game.imageUrl,
                                attributes: [
                                  { trait_type: "Created At", value: game.createdAt.toISOString() }
                                ]
                              };
                              // Upload metadata to Firebase Storage
                              const metadataPath = `metadata/${game.id}.json`;
                              const metadataRef = ref(storage, metadataPath);
                              const metadataString = JSON.stringify(metadata, null, 2);
                              await uploadString(metadataRef, metadataString, 'raw', {
                                contentType: 'application/json',
                                customMetadata: { uploadedBy: context.user.fid.toString() }
                              });
                              // Get the metadata URL through our API endpoint
                              const metadataUrl = `${window.location.origin}/api/metadata/${game.id}`;
                              // Set up viem clients
                              const publicClient = createPublicClient({
                                chain: base,
                                transport: http("https://mainnet.base.org"),
                              });
                              const walletClient = createWalletClient({
                                account: userAddress as `0x${string}`,
                                chain: base,
                                transport: custom(sdk.wallet.ethProvider)
                              });
                              // Define coin parameters (do NOT set initialPurchaseWei)
                              const coinParams = {
                                name: `Drawcast: ${game.prompt}`,
                                symbol: "DWT",
                                uri: metadataUrl,
                                payoutRecipient: userAddress as `0x${string}`,
                                platformReferrer: "0xAbE4976624c9A6c6Ce0D382447E49B7feb639565" as `0x${string}`,
                                tickLower: -199200,
                              };
                              // Always use Zora SDK's createCoin function
                              const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('Coin creation timed out after 60 seconds')), 60000);
                              });
                              const result = await Promise.race([
                                (async () => {
                                  try {
                                    const tx = await createCoin(coinParams, walletClient, publicClient);
                                    console.log('Transaction sent:', tx.hash);
                                    return tx;
                                  } catch (error) {
                                    console.error('Error in createCoin:', error);
                                    if (error instanceof Error) {
                                      console.error('CreateCoin error details:', {
                                        message: error.message,
                                        stack: error.stack
                                      });
                                    }
                                    throw error;
                                  }
                                })(),
                                timeoutPromise
                              ]) as { hash: `0x${string}`; address: `0x${string}` };
                              // Wait for transaction receipt
                              const receipt = await publicClient.waitForTransactionReceipt({ hash: result.hash });
                              if (receipt.status === 'success') {
                                const coinDeployment = getCoinCreateFromLogs(receipt);
                                // Update game document with isMinted field and token address
                                const gameRef = doc(db, 'games', game.id);
                                await setDoc(gameRef, {
                                  isMinted: true,
                                  tokenAddress: coinDeployment?.coin
                                }, { merge: true });

                                // Update user document with isCoined field
                                const userRef = doc(db, 'users', context.user.fid.toString());
                                await setDoc(userRef, {
                                  isCoined: true
                                }, { merge: true });

                                // Track successful coining event
                                trackEvent('drawing_coined_success');

                                setCreatedGames(prev => prev.map(g => 
                                  g.id === game.id ? {
                                    ...g,
                                    isMinted: true,
                                    tokenAddress: coinDeployment?.coin
                                  } : g
                                ));
                              } else {
                                throw new Error('Transaction failed');
                              }
                            } catch (error) {
                              console.error('Error in mint process:', error);
                              if (error instanceof Error) {
                                console.error('Error details:', {
                                  message: error.message,
                                  stack: error.stack
                                });
                              }
                            } finally {
                              setMintingGames(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(game.id);
                                return newSet;
                              });
                            }
                          }}
                          disabled={mintingGames.has(game.id)}
                          className={`bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors transform rotate-[1deg] border-2 border-dashed border-white text-sm w-fit ${
                            mintingGames.has(game.id) ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {mintingGames.has(game.id) ? 'Coining...' : 'Coin it!'}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                await sdk.actions.openUrl(`https://zora.co/coin/base:${game.tokenAddress}`);
                              } catch (error) {
                                console.error('Error opening Zora link:', error);
                              }
                            }}
                            className="bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors transform rotate-[1deg] border-2 border-dashed border-white text-sm w-fit"
                          >
                            View
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const castText = "I just coined my /drawcast masterpiece on @zora! Check it out!";
                                // Track share event
                                trackEvent('drawing_shared');
                                await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(`https://zora.co/coin/base:${game.tokenAddress}`)}`);
                              } catch (error) {
                                console.error('Error sharing to Warpcast:', error);
                              }
                            }}
                            className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors transform rotate-[-1deg] border-2 border-dashed border-white text-sm w-fit"
                          >
                            Share
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Add effect to fetch created games when collection page is shown
  useEffect(() => {
    const fetchCreatedGames = async () => {
      if (!context?.user?.fid || !showCollection) return;

      try {
        setIsLoadingGames(true);
        const gamesRef = collection(db, 'games');
        const q = query(
          gamesRef,
          where('userFid', '==', context.user.fid.toString())
        );
        const querySnapshot = await getDocs(q);
        
        const gamesData = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            imageUrl: data.imageUrl,
            shareImageUrl: data.shareImageUrl,
            prompt: data.prompt,
            totalGuesses: data.totalGuesses || 0,
            correctGuesses: data.correctGuesses || 0,
            createdAt: data.createdAt.toDate(),
            guesses: data.guesses || [],
            isMinted: data.isMinted || false,
            tokenAddress: data.tokenAddress,
            isBanned: data.isBanned || false
          };
        }).filter(game => !game.isBanned); // Filter out banned drawings
        
        setCreatedGames(gamesData);
      } catch (error) {
        console.error('Error fetching games:', error);
        setCreatedGames([]);
      } finally {
        setIsLoadingGames(false);
      }
    };

    fetchCreatedGames();
  }, [context?.user?.fid, showCollection, db]);

  // Track Collection page view
  useEffect(() => {
    if (showCollection) {
      trackEvent('collection_page_view');
    }
  }, [showCollection, trackEvent]);

  // Add checkDailyQuestCompletion function
  const checkDailyQuestCompletion = useCallback(async () => {
    if (!userStats || !context?.user?.fid) return;
    
    try {
      const userRef = doc(db, 'users', context.user.fid.toString());
      
      // Check if conditions are met
      const isCompleted = 
        (userStats.dailyGamesCreated || 0) >= 3 &&
        (userStats.dailyCorrectGuesses || 0) >= 3 &&
        (userStats.dailyShared || 0) >= 1;

      // Update database with the result
      await setDoc(userRef, {
        isDailyQuestCompleted: isCompleted,
        // Only increment dailyQuests and add points if the quest was just completed
        ...(isCompleted && !userStats.isDailyQuestCompleted ? { 
          dailyQuests: increment(1),
          points: increment(100),
          weeklyPoints: increment(100)
        } : {})
      }, { merge: true });

      // Update local state
      setIsDailyQuestCompleted(isCompleted);

      // Track quest completion in Google Analytics
      if (isCompleted && !userStats.isDailyQuestCompleted) {
        trackEvent('daily_quest_completed');
      }
    } catch (error) {
      console.error('Error updating daily quest completion status:', error);
    }
  }, [userStats, context?.user?.fid, db, trackEvent]);

  // Add useEffect to check quest completion when userStats changes
  useEffect(() => {
    checkDailyQuestCompletion();
  }, [userStats, checkDailyQuestCompletion]);

  // Add useEffect to check quest completion when guess page is shown
  useEffect(() => {
    if (showGuess) {
      checkDailyQuestCompletion();
    }
  }, [showGuess, checkDailyQuestCompletion]);

  // Add useEffect for premium expiration
  useEffect(() => {
    const checkPremiumExpiration = async () => {
      if (userStats?.isPremium && context?.user?.fid) {
        const userRef = doc(db, 'users', context.user.fid.toString());
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const deactivationDate = new Date(userData.premiumDeactivatedAt);
          const now = new Date();
          const daysUntilExpiration = Math.ceil((deactivationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          setPremiumExpirationDays(daysUntilExpiration);
        }
      } else {
        setPremiumExpirationDays(null);
      }
    };

    checkPremiumExpiration();
  }, [userStats?.isPremium, context?.user?.fid, db]);

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#f9f7f0',
        zIndex: 0,
        fontFamily: '"Comic Sans MS", "Marker Felt", cursive'
      }}
      className="bg-[#f9f7f0]"
    >
      {authState.isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-600">Loading...</div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="fixed top-0 left-0 right-0 z-10 bg-[#f9f7f0] border-b-2 border-dashed border-gray-400">
            <div className="w-[300px] mx-auto py-3">
              <div className="flex justify-center items-center gap-2">
                <Image
                  src="/icon.png"
                  alt="Icon"
                  width={40}
                  height={40}
                  priority
                  className="transform rotate-[-5deg]"
                />
                <span className="text-2xl font-bold text-gray-800 font-mono">drawcast</span><sup className="text-xs text-gray-800 transform rotate-[-3deg]">beta</sup>
              </div>
            </div>
          </div>

          {/* Main Content Area - Scrollable */}
          <div className="w-full h-full overflow-y-auto bg-[#f9f7f0]" style={{ 
            paddingTop: "72px",
            paddingBottom: "80px",
            backgroundColor: '#f9f7f0',
            position: 'relative',
            zIndex: 1
          }}>
            <div className="w-[300px] mx-auto px-2 bg-[#f9f7f0]">
              {showLeaderboard ? (
                renderLeaderboard()
              ) : showProfile ? (
                renderProfile()
              ) : isDrawing ? (
                renderDrawingPage()
              ) : showGuess ? (
                selectedGame ? renderGuessDetailPage() : renderGuessPage()
              ) : showCollection ? (
                renderCollection()
              ) : (
                // Main Draw Page
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                  <h2 className="text-2xl font-bold text-center text-gray-800 transform rotate-[-2deg]">Draw & challenge others!</h2>
                  <p className="text-m text-gray-600 text-center mb-8 transform rotate-[1deg]">Earn 10 points after each successful guess.</p>
                  <div className="flex flex-col items-center gap-6">
                    <button
                      onClick={handleDrawClick}
                      className="bg-[#0c703b] text-white py-4 px-8 rounded-lg text-xl font-bold hover:bg-[#0c703b] transition-colors transform rotate-[-1deg] border-4 border-dashed border-white"
                    >
                      Draw
                    </button>
                    <p className="text-sm text-gray-600 text-center">You&apos;ll have 30 seconds to draw a prompt.</p>
                  </div>
                  <p className="text-sm text-red-600 text-center font-bold">Letters are not allowed in your drawing.</p>

                </div>
              )}
            </div>
          </div>

          {/* Bottom navigation - Fixed */}
          <div className="fixed bottom-0 left-0 right-0 bg-[#f9f7f0] border-t-2 border-dashed border-gray-400 z-10">
            <div className="w-[300px] mx-auto">
              <div className="flex justify-around items-center h-[70px] gap-2">
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${!showLeaderboard && !showProfile && !isDrawing && !showGuess && !showCollection ? 'bg-green-100' : ''} transform rotate-[-1deg]`}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setShowCollection(false);
                    setSelectedGame(null);
                  }}
                >
                  <span className="text-2xl animate-wiggle">
                    <Image src="/draw.png" alt="Quiz" width={24} height={24} className="transform rotate-[2deg]" priority quality={75} unoptimized />
                  </span>
                  <span className="text-xs">Create</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showGuess ? 'bg-green-100' : ''} transform rotate-[1deg]`}
                  onClick={async () => {
                    setShowLeaderboard(false);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(true);
                    setShowCollection(false);
                    setSelectedGame(null);
                  }}
                >
                  <span className="text-2xl relative">
                    <Image src="/guess.png" alt="Guess" width={24} height={24} className="transform rotate-[-2deg] relative z-10" priority quality={75} unoptimized />
                    {!isDailyQuestCompleted && (
                      <div className="absolute inset-[-30%] bg-[#FFD700] rounded-full blur-md opacity-90 group-hover:opacity-100 transition-opacity duration-1200 animate-pulse"></div>
                    )}
                  </span>
                  <span className="text-xs">Join</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showCollection ? 'bg-green-100' : ''} transform rotate-[2deg] relative`}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setShowCollection(true);
                    setSelectedGame(null);
                  }}
                >
                  <span className="text-2xl">
                    <Image src="/collection.png" alt="Collection" width={24} height={24} className="transform rotate-[-2deg]" priority quality={75} unoptimized />
                  </span>
                  <span className="text-xs">Collect</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showLeaderboard ? 'bg-green-100' : ''} transform rotate-[-2deg]`}
                  onClick={() => {
                    setShowLeaderboard(true);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setShowCollection(false);
                    setSelectedGame(null);
                  }}
                > 
                  <span className="text-2xl">
                    <Image src="/leaderboard_black.png" alt="Leaderboard" width={24} height={24} className="transform rotate-[1deg]" priority quality={75} unoptimized />
                  </span>
                  <span className="text-xs">Rank</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showProfile ? 'bg-green-100' : ''} transform rotate-[2deg]`}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setShowProfile(true);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setShowCollection(false);
                    setSelectedGame(null);
                  }}
                >
                  <div className="text-2xl">
                    <Image src="/profile.png" alt="Profile" width={24} height={24} className="transform rotate-[-1deg]" priority quality={75} unoptimized />
                  </div>
                  <span className="text-xs">Profile</span>
                </button>
              </div>
            </div>
          </div>

          {/* Share Popup */}
          {showSharePopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[#f9f7f0] p-6 rounded-lg max-w-sm w-full mx-4 relative border-4 border-dashed border-gray-400 transform rotate-[-1deg]">
                {/* Close button */}
                <button
                  onClick={() => setShowSharePopup(false)}
                  className="absolute top-2 right-2 text-gray-800 hover:text-gray-600 transform rotate-[2deg] border-2 border-dashed border-gray-400 px-2 py-1 rounded-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>

                <h2 className="text-xl font-bold text-center mb-2 text-gray-800 transform rotate-[1deg]">Submitted, Great job!</h2>
                <p className="text-center text-gray-600 mb-6 transform rotate-[-2deg]">
                Get more points by inviting friends on Warpcast!
                </p>

                <button
                  onClick={handleShareToWarpcast}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 transform rotate-[2deg] border-4 border-dashed border-white"
                >
                  Share on Warpcast
                </button>
                <button
                  onClick={() => {
                    const gameUrl = `${window.location.origin}/games/${lastCreatedGameId}`;
                    navigator.clipboard.writeText(gameUrl);
                    // Show a temporary success message
                    const button = document.getElementById('copyLinkButton');
                    if (button) {
                      const originalText = button.textContent;
                      button.textContent = 'Copied!';
                      setTimeout(() => {
                        if (button) button.textContent = originalText;
                      }, 2000);
                    }
                  }}
                  id="copyLinkButton"
                  className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 transform rotate-[-1deg] border-4 border-dashed border-white mt-2"
                >
                  Copy game link
                </button>
              </div>
            </div>
          )}

          {/* Warpcast Modal */}
          {showWarpcastModal && <WarpcastModal />}

          {/* Level Up Modal */}
          {showLevelUpModal && <LevelUpModal />}

          {/* Add the drawing details modal */}
          {selectedDrawing && renderDrawingDetails()}

          {showZoraInfoModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[#f9f7f0] rounded-lg p-6 max-w-md w-full mx-4">
                
                <div className="flex justify-between items-center mb-4">
                  
                  <h3 className="text-xl font-bold">How this works</h3>
                  <button
                    onClick={() => setShowZoraInfoModal(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-gray-600 font-bold border-2 border-dashed border-red-200 rounded-lg p-2 bg-red-50">
                To coin a drawing, you need a funded preferred wallet.
On Warpcast, go to Settings → Preferred Wallets to set it up.
                </p>
                <br/>
                <p className="text-gray-600">When you coin a drawing, you deploy a Zora coin — a special ERC-20 media coin created using Zora&apos;s Coins Protocol.
                </p>
                <br/>
                <p className="text-gray-600">
                Your deployed coins become instantly tradable on Zora&apos;s market.
                </p>
                <br/>
                <p className="text-gray-600 font-bold">
                You will own 1% of the token supply (rest is available for the market) and earn 100% of the creator rewards.
                </p>
                <br/>

              </div>
            </div>
          )}

          {/* Quest Modal */}
          {showQuest && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[#f9f7f0] p-6 rounded-lg max-w-sm w-full mx-4 relative border-4 border-dashed border-gray-400 transform rotate-[-1deg]">
                {/* Close button */}
                <button
                  onClick={() => setShowQuest(false)}
                  className="absolute top-2 right-2 text-gray-800 hover:text-gray-600 transform rotate-[2deg] border-2 border-dashed border-gray-400 px-2 py-1 rounded-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>

                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold mb-4 text-gray-800 transform rotate-[1deg]">Daily Quest!</h2>
                  <p className="text-gray-600 mb-6 transform rotate-[-2deg]">
                    Complete all tasks every day to earn 100 bonus points!
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-400 transform rotate-[1deg]">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Image src="/draw.png" alt="Draw" width={24} height={24} className="transform rotate-[-2deg]" priority quality={75} unoptimized />
                        <span className="text-gray-800">Create 3 drawings</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">({userStats?.dailyGamesCreated || 0}/3)</span>
                        {userStats?.dailyGamesCreated && userStats.dailyGamesCreated >= 3 ? (
                          <span className="text-green-500">✓</span>
                        ) : (
                          <span> </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-400 transform rotate-[-1deg]">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Image src="/guess.png" alt="Guess" width={24} height={24} className="transform rotate-[2deg]" priority quality={75} unoptimized />
                        <span className="text-gray-800">Guess 3 drawings correctly</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">({userStats?.dailyCorrectGuesses || 0}/3)</span>
                        {userStats?.dailyCorrectGuesses && userStats.dailyCorrectGuesses >= 3 ? (
                          <span className="text-green-500">✓</span>
                        ) : (
                          <span> </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-400 transform rotate-[1deg]">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Image src="/shareicon.png" alt="Share" width={24} height={24} className="transform rotate-[-2deg]" priority quality={75} unoptimized />
                        <span className="text-gray-800">Share a drawing on Warpcast</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">({userStats?.dailyShared || 0}/1)</span>
                        {userStats?.dailyShared && userStats.dailyShared >= 1 ? (
                          <span className="text-green-500">✓</span>
                        ) : (
                          <span> </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


