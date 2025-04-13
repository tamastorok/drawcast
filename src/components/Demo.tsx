"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useFrame } from "~/components/providers/FrameProvider";
import { sdk } from '@farcaster/frame-sdk'
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, getDocs, arrayUnion, increment, writeBatch, where } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
//import { getAnalytics } from "firebase/analytics";

interface LeaderboardUser {
  fid: number;
  username: string;
  pfpUrl: string;
  points: number;
  isPremium?: boolean;
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
  const [userStats, setUserStats] = useState<{
    correctGuesses: number;
    points: number;
    created: number;
    gameSolutions: number;
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
  const storage = getStorage(app);
  //const analytics = getAnalytics(app);

  const castTextVariations = [
    "Think you can crack this drawing on Drawcast? Prove it and earn points. 🎨🕵️",
    "Can you guess what it is? Submit the correct answer to earn points! 🎨✨",
    "Challenge: Guess this drawing and earn points! 🎨🏆",
    "Here is a new drawing puzzle. Can you solve it? 🎨🧩",
    "New sketch dropped on Drawcast! Take a guess 👇🎨",
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
        await sdk.actions.ready({ disableNativeGestures: true });
        
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

        // Add frame as the last step
        console.log('Adding frame...');
        await sdk.actions.addFrame();
        console.log('Frame added successfully');
      } catch (error) {
        console.error('Error during initialization:', error);
      }
    };

    initializeFrame();
  }, [isSDKLoaded, context]);

  // Initialize Firebase auth state
  useEffect(() => {
    const initializeUser = async () => {
      if (!context?.user?.fid) {
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userId: null,
          error: null
        });
        return;
      }

      try {
        const fid = context.user.fid.toString();
        const userRef = doc(db, 'users', fid);
        const userDoc = await getDoc(userRef);
        
        const userData = {
          username: context.user.username || 'Anonymous',
          pfpUrl: context.user.pfpUrl || '',
          lastSeen: new Date(),
          isAnonymous: true
        };

        if (!userDoc.exists()) {
          await setDoc(userRef, {
            ...userData,
            createdAt: new Date()
          });
        } else {
          await setDoc(userRef, userData, { merge: true });
        }

        setAuthState({
          isLoading: false,
          isAuthenticated: true,
          userId: fid,
          error: null
        });

      } catch (error) {
        console.error('Error managing user data:', error);
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userId: null,
          error: 'Failed to manage user data'
        });
      }
    };

    initializeUser();
  }, [context?.user, db]);

  // Handle Farcaster context changes
  useEffect(() => {
    const updateUserData = async () => {
      if (!context?.user?.fid) return;

      try {
        // Always use FID as document ID
        const userRef = doc(db, 'users', context.user.fid.toString());
        const userDoc = await getDoc(userRef);
        
        const userData = {
          username: context.user.username || 'Anonymous',
          pfpUrl: context.user.pfpUrl || '',
          lastSeen: new Date(),
          isAnonymous: true
        };

        if (userDoc.exists()) {
          // Update existing document
          await setDoc(userRef, userData, { merge: true });
        } else {
          // Create new document with FID as document ID
          await setDoc(userRef, {
            ...userData,
            createdAt: new Date()
          });
        }
      } catch (error) {
        console.error('Error updating user data with Farcaster context:', error);
      }
    };

    updateUserData();
  }, [context?.user]);

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
        ctx.lineWidth = 3;
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

  // Mock data for testing
  const mockLeaderboardData: LeaderboardData = {
    topUsers: [
      { fid: 1, username: "User1", pfpUrl: "/profile.png", points: 100, isPremium: true },
      { fid: 2, username: "User2", pfpUrl: "/profile.png", points: 90 },
      { fid: 3, username: "User3", pfpUrl: "/profile.png", points: 80 },
    ],
    currentUser: context?.user ? {
      fid: context.user.fid,
      username: context.user.username || '',
      pfpUrl: context.user.pfpUrl || '',
      points: 75,
      rank: 4,
      isPremium: false
    } : null
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
          const totalPoints = ((userData.correctGuesses || 0) * 10) + ((userData.gameSolutions || 0) * 10);
          setUserStats({
            correctGuesses: userData.correctGuesses || 0,
            points: totalPoints,
            created: userData.gamesCreated || 0,
            gameSolutions: userData.gameSolutions || 0
          });
        } else {
          setUserStats({
            correctGuesses: 0,
            points: 0,
            created: 0,
            gameSolutions: 0
          });
        }
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

        {/* Leaderboard Position */}
        <div className="bg-gray-100 p-4 rounded-lg text-center mb-6 text-gray-800 transform rotate-[-1deg] border-2 border-dashed border-gray-400">
          <div className="text-2xl font-bold text-gray-800">
            {mockLeaderboardData.currentUser?.rank ? `#${mockLeaderboardData.currentUser.rank}` : 'Not ranked'}
          </div>
          <div className="text-sm text-gray-800">
            Leaderboard Position
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.correctGuesses || 0}
            </div>
            <div className="text-sm text-gray-800">
              Solved
            </div>
          </div>
          <div className="bg-gray-100 p-4 rounded-lg text-center transform rotate-[-2deg] border-2 border-dashed border-gray-400">
            <div className="text-2xl font-bold text-gray-800">
              {userStats?.created || 0}
            </div>
            <div className="text-sm text-gray-800">
              Created
            </div>
          </div>
        </div>

        {/* Points */}
        <div className="bg-gray-100 p-4 rounded-lg text-center mb-6 transform rotate-[1deg] border-2 border-dashed border-gray-400">
          <div className="text-2xl font-bold text-gray-800">
            {userStats?.points || 0}
          </div>
          <div className="text-sm text-gray-800">
            Points
          </div>
        </div>

        {/* Created Games Section */}
        <div className="mb-6">
          <button
            onClick={() => setIsDrawingsExpanded(!isDrawingsExpanded)}
            className="w-full flex justify-between items-center p-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors transform rotate-[-1deg] border-2 border-dashed border-gray-400"
          >
            <h3 className="text-lg font-bold text-gray-800">Your Drawings</h3>
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

  const renderLeaderboard = () => {
    return (
      <div>
        <div className="space-y-2">
          {mockLeaderboardData.topUsers.map((user, index) => (
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
                />
              )}
              <div className="flex-1">
                <div className="font-bold">{user.username}{user.isPremium && <span className="text-xs" title="Premium user"> ⭐</span>}</div>
                <div className="text-sm text-gray-600">{user.points} points</div>
              </div>
            </div>
          ))}

          {/* Show current user's position if not in top 10 */}
          {mockLeaderboardData.currentUser && (
            <>
              <div className="h-4"></div>
              <div className="border-t-2 border-dashed border-gray-400 my-2"></div>
              <div 
                className="p-3 bg-green-100 rounded-lg flex items-center gap-3 transform rotate-[1deg] border-2 border-dashed border-gray-400"
              >
                <div className="text-lg font-bold w-8">{mockLeaderboardData.currentUser.rank}</div>
                {mockLeaderboardData.currentUser.pfpUrl && (
                  <Image 
                    src={mockLeaderboardData.currentUser.pfpUrl} 
                    alt={mockLeaderboardData.currentUser.username} 
                    width={32} 
                    height={32} 
                    className="rounded-full transform rotate-[-2deg]"
                  />
                )}
                <div className="flex-1">
                  <div className="font-bold">{mockLeaderboardData.currentUser.username}</div>
                  <div className="text-sm text-gray-600">{mockLeaderboardData.currentUser.points} points</div>
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

    // Check authentication state
    if (!authState.isAuthenticated || !context?.user?.fid) {
      console.error('User not authenticated');
      setGuessError('Please connect with Farcaster to upload drawings');
      return;
    }

    try {
      setIsUploading(true);
      
      // Get the canvas data and upload
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      const timestamp = new Date().getTime();
      const drawingFilename = `drawings/${context.user.fid.toString()}_${timestamp}.png`;
      const storageRef = ref(storage, drawingFilename);
      
      await uploadString(storageRef, base64Data, 'base64', {
        contentType: 'image/png',
        customMetadata: {
          uploadedBy: context.user.fid.toString()
        }
      });

      // Get the download URL
      const imageUrl = await getDownloadURL(storageRef);
      
      let shareImageUrl = 'https://drawcast.xyz/image.png'; // Default fallback URL
      
      // Generate share image
      try {
        shareImageUrl = await generateShareImage(imageUrl, context.user.fid.toString());
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

      // Add the game document to Firestore and update user's gamesCreated count
      const batch = writeBatch(db);
      
      // Add game document
      const gamesRef = collection(db, 'games');
      const newGameRef = doc(gamesRef);
      batch.set(newGameRef, gameData);

      // Update user's gamesCreated count using FID
      const userRef = doc(db, 'users', context.user.fid.toString());
      batch.update(userRef, {
        gamesCreated: increment(1)
      });

      await batch.commit();
      setLastCreatedGameId(newGameRef.id);
      setShowSharePopup(true);

    } catch (error) {
      console.error('Error uploading drawing or creating game:', error);
      setGuessError('Failed to upload drawing. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Update generateShareImage to use FID
  const generateShareImage = async (drawingUrl: string, gameId: string): Promise<string> => {
    try {
      console.log('Starting share image generation...');
      
      if (!context?.user?.fid) {
        throw new Error('User not authenticated');
      }
      
      const response = await fetch('/api/generate-share-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drawingUrl,
          gameId,
          userId: context.user.fid.toString()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate share image');
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
              You will earn 10 points for successfully guessing this drawing. You can guess only once.
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
      
      // Check if user has already guessed this game
      const gameRef = doc(db, 'games', selectedGame.id);
      const gameDoc = await getDoc(gameRef);
      
      if (gameDoc.exists()) {
        const gameData = gameDoc.data();
        const existingGuess = gameData.guesses?.find(
          (guess: Guess) => guess.userId === context.user.fid.toString()
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
        userId: context.user.fid.toString(),
        username: context.user.username || 'Anonymous',
        guess: currentGuess.trim().toLowerCase(),
        isCorrect,
        createdAt: new Date()
      };

      // Use a batch to ensure atomicity
      const batch = writeBatch(db);

      // Update the game document with the new guess
      batch.update(gameRef, {
        guesses: arrayUnion(guess),
        totalGuesses: increment(1),
        correctGuesses: isCorrect ? increment(1) : increment(0)
      });

      // If the guess is correct, update both the guesser's and creator's points
      if (isCorrect) {
        // Update guesser's points using FID
        const guesserRef = doc(db, 'users', context.user.fid.toString());
        batch.update(guesserRef, {
          points: increment(10),
          correctGuesses: increment(1)
        });

        // Update creator's points and gameSolutions
        const creatorRef = doc(db, 'users', selectedGame.userFid);
        batch.update(creatorRef, {
          gameSolutions: increment(1)
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
                {userGuess.isCorrect ? '✅ Correct!' : '❌ Wrong'}
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
    return (
      <div>
        <h1 className="text-l text-center mb-6 text-gray-600">Guess the drawings, earn points and climb the leaderboard!</h1>
        <div className="space-y-2">
          {games.map((game) => {
            // Check if current user has already guessed this game
            const userGuess = game.guesses?.find(
              (guess: Guess) => guess.userId === context?.user?.fid?.toString()
            );

            const timeInfo = formatTimeRemaining(game.expiredAt);

            return (
              <button
                key={game.id}
                onClick={() => {
                  setSelectedGame(game);
                  setGuessError(null);
                }}
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
                      onClick={() => {
                        setIsDrawing(true);
                        setShowTimeUpPopup(false);
                        setTimeLeft(30);
                        if (timerRef.current) {
                          clearInterval(timerRef.current);
                        }
                      }}
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
                  <span className="text-xs">Top</span>
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
        </>
      )}
    </div>
  );
}


