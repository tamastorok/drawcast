"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useFrame } from "~/components/providers/FrameProvider";
import { sdk } from '@farcaster/frame-sdk'
import { initializeApp, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, getDocs, arrayUnion, increment, writeBatch, where } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";

interface LeaderboardUser {
  fid: number;
  username: string;
  pfpUrl: string;
  points: number;
  isPremium?: boolean;
  isEarlyAdopter?: boolean;
  rank?: number;
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

export default function Demo({ initialGameId }: { initialGameId?: string }) {
  const { isSDKLoaded, context } = useFrame();
  const [showProfile, setShowProfile] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGuess, setShowGuess] = useState(!!initialGameId);
  const [selectedGame, setSelectedGame] = useState<typeof games[0] | null>(null);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [currentGuess, setCurrentGuess] = useState('');
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [guessError, setGuessError] = useState<string | null>(null);
  const [showPresaveModal, setShowPresaveModal] = useState(false);
  const [userStats, setUserStats] = useState<{
    correctGuesses: number;
    points: number;
    created: number;
    gameSolutions: number;
    isEarlyAdopter?: boolean;
    streak?: number;
    streakPoints?: number;
  } | null>(null);
  const [createdGames, setCreatedGames] = useState<Array<{
    id: string;
    imageUrl: string;
    prompt: string;
    totalGuesses: number;
    correctGuesses: number;
    createdAt: Date;
  }>>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
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
  const trackEvent = (eventName: string, eventParams?: Record<string, string | number | boolean>) => {
    if (typeof window !== 'undefined' && analytics) {
      logEvent(analytics, eventName, {
        ...eventParams,
        userFid: context?.user?.fid || 'anonymous',
        username: context?.user?.username || 'anonymous',
        timestamp: new Date().toISOString()
      });
    }
  };

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
        
        // Track frame addition
        trackEvent('frame_added');
        
        // Show presave modal immediately if we have context
        if (context) {
          setShowPresaveModal(true);
        }
        
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
              streakPoints: 1
            });
          } else {
            console.log('Updating existing user document');
            const currentLevel = getLevelInfo(userDoc.data().points || 0).level;
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

  // Update the level change effect to also update Firestore
  useEffect(() => {
    if (userStats?.points !== undefined && context?.user?.fid) {
      const currentLevel = getLevelInfo(userStats.points).level;
      
      // If we have a previous level and it's different from current level
      if (previousLevel !== null && currentLevel > previousLevel) {
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
  }, [userStats?.points, context?.user?.fid, db]);

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
          } else {
            console.log('No words found in nouns array');
            setCurrentPrompt('Error loading prompt');
          }
        } else {
          console.log('Nouns document does not exist');
          setCurrentPrompt('Error loading prompt');
        }
      } catch (error) {
        console.error('Error generating prompt:', error);
        setCurrentPrompt('Error loading prompt');
      }
    };

    if (isDrawing) {
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
        canvas.width = 600;
        canvas.height = 600;
        
        // Fill canvas with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Set drawing style
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isDrawing]);

  // Timer effect
  useEffect(() => {
    if (isDrawing && !showTimeUpPopup) {
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
  }, [isDrawing, showTimeUpPopup]);

  // Reset timer when starting new drawing
  const handleStartNew = async () => {
    setShowTimeUpPopup(false);
    setTimeLeft(30);
    setCurrentPrompt('Loading prompt...');
    
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
        } else {
          console.log('No words found in nouns array');
          setCurrentPrompt('Error loading prompt');
        }
      } else {
        console.log('Nouns document does not exist');
        setCurrentPrompt('Error loading prompt');
      }
    } catch (error) {
      console.error('Error generating new prompt:', error);
      setCurrentPrompt('Error loading prompt');
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

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    startDrawing(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    draw(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    stopDrawing();
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
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

  // Fetch user stats and created games when profile is shown
  useEffect(() => {
    const fetchUserData = async () => {
      if (!context?.user?.fid || !showProfile) return;

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
            streakPoints: userData.streakPoints || 1
          });
        } else {
          setUserStats({
            correctGuesses: 0,
            points: 0,
            created: 0,
            gameSolutions: 0,
            isEarlyAdopter: false,
            streak: 1,
            streakPoints: 1
          });
        }

        // Fetch leaderboard data to get current user's rank
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
            isEarlyAdopter: data.isEarlyAdopter || false
          };
        });

        // Sort users by points in descending order
        const sortedUsers = users.sort((a, b) => b.points - a.points);

        // Add rank to each user
        const rankedUsers = sortedUsers.map((user, index) => ({
          ...user,
          rank: index + 1
        }));

        // Find current user
        const currentUser = rankedUsers.find(user => user.fid === context.user.fid) || null;

        // Update leaderboard data with current user's rank
        setLeaderboardData(prev => ({
          ...prev,
          currentUser
        }));
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserStats(null);
      }
    };

    fetchUserData();
  }, [context?.user?.fid, showProfile, db]);

  // Fetch created games when section is expanded
  useEffect(() => {
    const fetchCreatedGames = async () => {
      if (!context?.user?.fid || !isDrawingsExpanded) return;

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
            prompt: data.prompt,
            totalGuesses: data.totalGuesses || 0,
            correctGuesses: data.correctGuesses || 0,
            createdAt: data.createdAt.toDate()
          };
        });
        
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
    if (points >= 3000) return { level: 11, name: "Drawing God 💎" };
    if (points >= 2300) return { level: 10, name: "Drawing Hero 🦸‍♂️" };
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

      // Calculate total points (regular points + streak points)
      const totalPoints = (userData.points || 0) + streakPoints;

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

  const renderProfile = () => {
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

        {/* Username */}
        <h2 className="text-xl font-bold text-center mb-2 text-gray-800 transform rotate-[1deg]">
          {context?.user?.username || 'Anonymous'}
        </h2>

        {/* Level Display */}
        {userStats && (
          <div className="text-center mb-4 text-gray-600 transform rotate-[-1deg]">
            Level {getLevelInfo(userStats.points || 0).level}: {getLevelInfo(userStats.points || 0).name}
          </div>
        )}

        {/* Badges Section */}
        <div className="mb-6">
          <div className="flex justify-center gap-4">
            {/* Early Adopter Badge */}
            {userStats?.isEarlyAdopter && (
              <div className="bg-green-100 p-3 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-green-400">
                <div className="mb-1 flex justify-center items-center">
                  <div className="relative group">
                    <Image 
                      src="/OGbadge.png" 
                      alt="Early Adopter" 
                      width={40} 
                      height={40} 
                      className="rounded-full transform rotate-[-2deg] cursor-help"
                      title="OG user"
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      OG user
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Add Streak Display */}
        <div className="bg-gray-100 p-4 rounded-lg text-center mb-6 transform rotate-[1deg] border-2 border-dashed border-gray-400">
          <div className="relative group">
            <div className="absolute top-0 right-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <div className="absolute bottom-1/2 right-full mr-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-normal w-48 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                Earn 1 point daily - keep your streak<br />to earn up to 20 daily!
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.streak || 0}
            </div>
            <div className="text-sm text-gray-800">
              Day Streak 🔥
            </div>
          </div>
        </div>
        
        {/* Leaderboard Position and Points Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[-1deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {leaderboardData.currentUser?.rank ? `#${leaderboardData.currentUser.rank}` : 'Not ranked'}
            </div>
            <div className="text-sm text-gray-800">
              Rank
            </div>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[1deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.points || 0}
            </div>
            <div className="text-sm text-gray-800">
              Points
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.correctGuesses || 0}
            </div>
            <div className="text-sm text-gray-800">
              Correct guesses
            </div>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[-2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.gameSolutions || 0}
            </div>
            <div className="text-sm text-gray-800">
              Game solutions
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
                    <div 
                      key={game.id}
                      className={`p-4 rounded-lg transform rotate-${index % 2 === 0 ? '[-1deg]' : '[1deg]'} border-2 border-dashed border-gray-400`}
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
                    </div>
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
            isEarlyAdopter: data.isEarlyAdopter || false
          };
        });

        // Sort users by points in descending order
        const sortedUsers = users.sort((a, b) => b.points - a.points);

        // Add rank to each user
        const rankedUsers = sortedUsers.map((user, index) => ({
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
      }
    };

    if (showLeaderboard) {
      fetchLeaderboardData();
    }
  }, [showLeaderboard, context?.user?.fid, db]);

  const renderLeaderboard = () => {
    return (
      <div>
        <div className="space-y-2">
          {leaderboardData.topUsers.map((user, index) => (
            <div 
              key={user.fid}
              className={`p-3 rounded-lg flex items-center gap-3 transform rotate-${index % 2 === 0 ? '[-1deg]' : '[1deg]'} ${
                context?.user?.fid === user.fid 
                  ? 'bg-green-100' 
                  : 'bg-gray-100'
              } border-2 border-dashed border-gray-400`}
            >
              <div className="text-lg font-bold w-8">{user.rank}</div>
              {user.pfpUrl && (
                <Image 
                  src={user.pfpUrl} 
                  alt={user.username} 
                  width={32} 
                  height={32} 
                  className="rounded-full transform rotate-[2deg]"
                />
              )}
              <div className="flex-1">
                <div className="font-bold flex items-center gap-2">
                  {user.username}
                  {user.isEarlyAdopter && (
                    <div className="relative group">
                      <Image 
                        src="/OGbadge.png" 
                        alt="Early Adopter" 
                        width={20} 
                        height={20} 
                        className="rounded-full transform rotate-[-2deg] cursor-help"
                        title="OG user"
                      />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        OG user
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-600">{user.points} points</div>
              </div>
            </div>
          ))}

          {/* Show current user's position if not in top 10 */}
          {leaderboardData.currentUser && !leaderboardData.topUsers.some(u => u.fid === leaderboardData.currentUser?.fid) && (
            <>
              <div className="h-4"></div>
              <div className="border-t-2 border-dashed border-gray-400 my-2"></div>
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
                  />
                )}
                <div className="flex-1">
                  <div className="font-bold flex items-center gap-2">
                    {leaderboardData.currentUser.username}
                    {leaderboardData.currentUser.isEarlyAdopter && (
                      <div className="relative group">
                        <Image 
                          src="/icon.png" 
                          alt="Early Adopter" 
                          width={20} 
                          height={20} 
                          className="rounded-full transform rotate-[-2deg] cursor-help"
                          title="OG user"
                        />
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          OG user
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">{leaderboardData.currentUser.points} points</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const handleDrawingSubmit = async () => {
    if (!canvasRef.current) {
      console.error('No canvas reference');
      setGuessError('Please try drawing again');
      return;
    }

    if (!context?.user?.fid) {
      console.error('No Farcaster user context');
      setGuessError('Please connect with Farcaster to upload drawings');
      return;
    }

    try {
      setIsUploading(true);
      
      // Update user streak
      await updateUserStreak(context.user.fid.toString());
      
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
        gamesCreated: increment(1)
      });

      console.log('Committing batch...');
      await batch.commit();
      console.log('Batch committed successfully');
      
      setLastCreatedGameId(newGameRef.id);
      setShowSharePopup(true);
      setIsDrawing(false); // Exit drawing mode after successful submission

    } catch (error) {
      console.error('Error uploading drawing or creating game:', error);
      setGuessError('Failed to upload drawing. Please try again.');
    } finally {
      setIsUploading(false);
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
    const castText = `${randomCastText}\n\n${gameUrl}`;

    try {
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
          <button
            onClick={() => {
              if (timerRef.current) {
                clearInterval(timerRef.current);
              }
              setIsDrawing(false);
              setShowTimeUpPopup(false);
            }}
            className="flex items-center gap-1 text-gray-800 hover:text-gray-600 mb-2 transition-colors transform rotate-[-1deg] px-3 py-1 rounded-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            <span>Back to home</span>
          </button>
          <h1 className="text-2xl font-bold text-center mb-4 text-gray-600">Draw: {currentPrompt || 'Loading...'}</h1>
          <div className="text-center mb-4 text-gray-600">
            Time left: {timeLeft}s
          </div>

          {/* Drawing Canvas Area */}
          <div className="w-full aspect-square bg-white rounded-lg mb-4 border-2 border-gray-300 overflow-hidden select-none"
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
          
          <div className="space-y-4">
            <p className="text-sm text-center text-gray-600 font-bold">
              You will earn 10 points after each correct guess.
            </p>
            <button 
              onClick={handleDrawingSubmit}
              disabled={isUploading}
              className="w-full bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed transform rotate-[-1deg] border-4 border-dashed border-white"
            >
              {isUploading ? 'Uploading...' : 'Submit'}
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
                  className="flex-1 bg-[#0c703b] text-white py-2 px-4 rounded-md hover:bg-[#0c703b] transition-colors transform rotate-[-1deg] border-4 border-dashed border-white"
                >
                  Submit
                </button>
                <button
                  onClick={handleStartNew}
                  className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors transform rotate-[1deg] border-4 border-dashed border-white"
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
  useEffect(() => {
    const fetchGames = async () => {
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
            totalGuesses: gameData.totalGuesses || 0
          };
        }));
        
        setGames(gamesData);
        
        // If we have an initialGameId, select that game
        if (initialGameId) {
          const game = gamesData.find(g => g.id === initialGameId);
          if (game) {
            setSelectedGame(game);
          }
        }
      } catch (error) {
        console.error('Error fetching games:', error);
      }
    };

    if (showGuess) {
      fetchGames();
    }
  }, [showGuess, db, initialGameId]);

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
      
      // Update user streak
      await updateUserStreak(fid);
      
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

      // Use a batch to ensure atomicity
      const batch = writeBatch(db);

      // If the guess is correct, update both the guesser's and creator's points
      if (isCorrect) {
        // First get the current values
        const guesserRef = doc(db, 'users', fid);
        const creatorRef = doc(db, 'users', selectedGame.userFid);
        
        const guesserDoc = await getDoc(guesserRef);
        const creatorDoc = await getDoc(creatorRef);
        
        // Calculate points using current values
        let guesserPoints = 0;
        let creatorPoints = 0;
        
        if (guesserDoc.exists()) {
          const guesserData = guesserDoc.data();
          guesserPoints = ((guesserData.correctGuesses || 0) + 1) * 10; // Add 1 for the new correct guess
          if (fid === selectedGame.userFid) {
            guesserPoints += ((guesserData.gameSolutions || 0) + 1) * 10; // Add 1 for the new game solution
          } else {
            guesserPoints += (guesserData.gameSolutions || 0) * 10;
          }
        }
        
        if (creatorDoc.exists()) {
          const creatorData = creatorDoc.data();
          creatorPoints = (creatorData.correctGuesses || 0) * 10;
          creatorPoints += ((creatorData.gameSolutions || 0) + 1) * 10; // Add 1 for the new game solution
        }

        // Update all fields in a single batch
        batch.update(guesserRef, {
          correctGuesses: increment(1),
          points: guesserPoints
        });

        // Update creator's fields
        batch.update(creatorRef, {
          gameSolutions: increment(1),
          points: creatorPoints
        });

        // Update the game document with the new guess
        batch.update(gameRef, {
          guesses: arrayUnion(guess),
          totalGuesses: increment(1),
          correctGuesses: isCorrect ? increment(1) : increment(0)
        });

        // Commit all updates
        await batch.commit();
      }

      // Update the local state to show the result
      setSelectedGame(prev => prev ? {
        ...prev,
        guesses: [...(prev.guesses || []), guess]
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
    
    return (
      <div>
        <button
          onClick={async () => {
            // Fetch fresh data before going back to list
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
                  totalGuesses: gameData.totalGuesses || 0
                };
              }));
              
              setGames(gamesData);
            } catch (error) {
              console.error('Error fetching updated games:', error);
            }
            
            setSelectedGame(null);
            setCurrentGuess('');
            setGuessError(null);
          }}
          className="flex items-center gap-1 text-gray-800 hover:text-gray-600 mb-2 transition-colors transform rotate-[-1deg] px-3 py-1 rounded-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span>Back to list</span>
        </button>
        <h1 className="text-2xl font-bold text-center mb-4">Make your guess!</h1>
        <div className="text-center text-gray-600 mb-4">
          Drawing by {selectedGame.username}
        </div>
        <div className="text-center text-gray-600 mb-4">
          {selectedGame.totalGuesses}/10 players
        </div>
        <div className="aspect-square relative bg-white rounded-lg overflow-hidden">
          <Image
            src={selectedGame.imageUrl}
            alt="Drawing to guess"
            fill
            className="object-contain"
          />
        </div>
        {!isExpired && (
          <p className="text-sm text-center text-gray-600 mb-4">
            Earn 10 points for successfully guessing this drawing. <br />
            <span className="font-bold">You can guess only once.</span>
          </p>
        )}
            
        <div className="space-y-4">
          {isExpired ? (
            <div className="p-4 rounded-lg text-center bg-red-100 text-red-800 mt-4">
              This game has ended
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
            </>
          )}

          {/* Share on Warpcast button */}
          {!isExpired && (
            <button
              onClick={async () => {
                const gameUrl = `${window.location.origin}/games/${selectedGame.id}`;
                // Randomly select a cast text variation
                const randomCastText = castTextVariations[Math.floor(Math.random() * castTextVariations.length)];
                const castText = `${randomCastText}\n\n${gameUrl}`;
                try {
                  await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}&embeds[]=${encodeURIComponent(gameUrl)}`);
                } catch (error) {
                  console.error('Error sharing to Warpcast:', error);
                }
              }}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 transform rotate-[2deg] border-4 border-dashed border-white"
            >
              <span>Share on Warpcast</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderGuessPage = () => {
    // Filter active games
    const activeGames = games.filter(game => {
      const isExpired = game.expiredAt.getTime() <= new Date().getTime();
      const hasMaxGuesses = game.totalGuesses >= 10;
      return !isExpired && !hasMaxGuesses;
    });

    return (
      <div>
        <h1 className="text-l text-center mb-6 text-gray-600">Guess the drawings, earn points and climb the leaderboard!</h1>
        <div className="space-y-2">
          {activeGames.map((game) => {
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
          {activeGames.length === 0 && (
            <div className="text-center p-4 bg-gray-100 rounded-lg text-gray-600 transform rotate-[1deg] border-2 border-dashed border-gray-400">
              No active games at the moment. Be the first to create one!
            </div>
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

  // Add PresaveModal component
  const PresaveModal = () => {
    const handlePresave = async () => {
      try {
        // Here you can add any presave logic
        console.log('Presaving app...');
        
        // After presave, initialize the frame
        await sdk.actions.ready({ disableNativeGestures: true });
        await sdk.actions.addFrame();
        
        // Only mark as early adopter if frame was successfully added
        if (context?.user?.fid) {
          const fid = context.user.fid.toString();
          const userRef = doc(db, 'users', fid);
          await setDoc(userRef, {
            isEarlyAdopter: true,
            cohort: 1
          }, { merge: true });
          console.log('User marked as early adopter:', fid);
        }
      } catch (error) {
        console.error('Error during presave:', error);
      }
    };

    return (
      <div className="fixed inset-0 bg-[#f9f7f0] flex items-center justify-center z-50 border-4 border-dashed border-gray-400">
        {context?.user?.fid === 234692 && (
          <button
            onClick={() => setShowPresaveModal(false)}
            className="absolute top-4 right-4 text-gray-800 hover:text-gray-600 transform rotate-[2deg] border-2 border-dashed border-gray-400 px-2 py-1 rounded-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
        <div className="w-[300px] mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 transform rotate-[-2deg]">
            Drawcast is coming very soon!
          </h2>
          <p className="text-gray-600 mb-8 transform rotate-[1deg]">
          Compete, laugh, and earn points in the most unpredictable sketch battle.
          </p>
          <button
            onClick={handlePresave}
            className="w-full bg-[#0c703b] text-white py-4 px-8 rounded-lg text-xl font-bold hover:bg-[#0c703b] transition-colors transform rotate-[-1deg] border-4 border-dashed border-white mb-4"
          >
            Presave
          </button>
          <p className="text-sm text-gray-600 transform rotate-[2deg]">
          Presave the app now to join the early adopters and unlock an exclusive OG badge!
          </p>
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
  }, [isDrawing, showGuess, showLeaderboard, showProfile]);

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
                const shareText = `I just reached Level ${newLevelInfo.level}: ${newLevelInfo.name} on drawcast.xyz! 🎨✨`;
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

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

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
          {/* Presave Modal */}
          {showPresaveModal && <PresaveModal />}

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
                    <p className="text-sm text-gray-600 text-center">You&apos;ll have 30 seconds to draw.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom navigation - Fixed */}
          <div className="fixed bottom-0 left-0 right-0 bg-[#f9f7f0] border-t-2 border-dashed border-gray-400 z-10">
            <div className="w-[300px] mx-auto">
              <div className="flex justify-around items-center h-[70px]">
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${!showLeaderboard && !showProfile && !isDrawing && !showGuess ? 'bg-green-100' : ''} transform rotate-[-1deg]`}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setSelectedGame(null);
                  }}
                >
                  <span className="text-2xl animate-wiggle">
                    <Image src="/draw.png" alt="Quiz" width={24} height={24} className="transform rotate-[2deg]" />
                  </span>
                  <span className="text-xs">Create</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showGuess ? 'bg-green-100' : ''} transform rotate-[1deg]`}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(true);
                    setSelectedGame(null);
                  }}
                >
                  <span className="text-2xl">
                    <Image src="/guess.png" alt="Guess" width={24} height={24} className="transform rotate-[-2deg]" />
                  </span>
                  <span className="text-xs">Join</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showLeaderboard ? 'bg-green-100' : ''} transform rotate-[-2deg]`}
                  onClick={() => {
                    setShowLeaderboard(true);
                    setShowProfile(false);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setSelectedGame(null);
                  }}
                > 
                  <span className="text-2xl"><Image src="/leaderboard_black.png" alt="Leaderboard" width={24} height={24} className="transform rotate-[1deg]" /></span>
                  <span className="text-xs">Rank</span>
                </button>
                <button 
                  className={`flex flex-col items-center justify-center w-full h-full ${showProfile ? 'bg-green-100' : ''} transform rotate-[2deg]`}
                  onClick={() => {
                    setShowLeaderboard(false);
                    setShowProfile(true);
                    setIsDrawing(false);
                    setShowGuess(false);
                    setSelectedGame(null);
                  }}
                >
                  <div className="text-2xl">
                    <Image src="/profile.png" alt="Profile" width={24} height={24} className="transform rotate-[-1deg]" />
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

                <h2 className="text-xl font-bold text-center mb-2 text-gray-800 transform rotate-[1deg]">Drawing Submitted!</h2>
                <p className="text-center text-gray-600 mb-6 transform rotate-[-2deg]">
                Invite your friends and earn points every time they guess correctly! 
                </p>

                <button
                  onClick={handleShareToWarpcast}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 transform rotate-[2deg] border-4 border-dashed border-white"
                >
                  Share on Warpcast
                </button>
              </div>
            </div>
          )}

          {/* Warpcast Modal */}
          {showWarpcastModal && <WarpcastModal />}

          {/* Level Up Modal */}
          {showLevelUpModal && <LevelUpModal />}
        </>
      )}
    </div>
  );
}


