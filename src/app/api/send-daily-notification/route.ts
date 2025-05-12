import { NextRequest } from "next/server";
import { sendNeynarFrameNotification, fetchNotificationTokens, getNeynarClient } from "~/lib/neynar";
import type { NotificationToken } from "~/lib/neynar";

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Notification message variations
const NOTIFICATION_MESSAGES = [
  "Time to draw and challenge your friends!",
  "Ready for today's drawing challenge?",
  "Your daily drawing adventure awaits!",
  "New drawing prompt waiting for you!",
  "Join the creative fun - it's drawing time!",
  "Show off your artistic skills today!",
  "Don't miss today's drawing challenge!"
];

// Helper function to get random message
const getRandomMessage = () => {
  const randomIndex = Math.floor(Math.random() * NOTIFICATION_MESSAGES.length);
  return NOTIFICATION_MESSAGES[randomIndex];
};

// Helper function to process tokens in batches with retries
async function processBatch(tokens: NotificationToken[], batchSize: number = 100, delayMs: number = 1000, maxRetries: number = 3) {
  const results = [];
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(tokens.length/batchSize)}`);
    
    const batchResults = await Promise.all(
      batch.map(async (token) => {
        console.log("Sending notification to FID:", token.fid);
        let lastError;
        
        // Try up to maxRetries times
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const result = await sendNeynarFrameNotification({
              fid: token.fid,
              title: "Drawcast",
              body: getRandomMessage(),
              targetUrl: "https://drawcast.xyz/?utm_source=Notification&utm_medium=Daily"
            });
            
            // If successful or no token, return immediately
            if (result.state === "success" || result.state === "no_token") {
              return { fid: token.fid, result };
            }
            
            // If error, wait before retrying
            lastError = result.error;
            if (attempt < maxRetries) {
              const retryDelay = attempt * 1000; // Exponential backoff
              console.log(`Retry ${attempt}/${maxRetries} for FID ${token.fid} after ${retryDelay}ms`);
              await delay(retryDelay);
            }
          } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
              const retryDelay = attempt * 1000; // Exponential backoff
              console.log(`Retry ${attempt}/${maxRetries} for FID ${token.fid} after ${retryDelay}ms`);
              await delay(retryDelay);
            }
          }
        }
        
        // If we get here, all retries failed
        console.error(`All retries failed for FID ${token.fid}:`, lastError);
        return { fid: token.fid, result: { state: "error", error: lastError } };
      })
    );
    
    results.push(...batchResults);
    
    // Add delay between batches, but not after the last batch
    if (i + batchSize < tokens.length) {
      console.log(`Waiting ${delayMs}ms before next batch...`);
      await delay(delayMs);
    }
  }
  return results;
}

// Function to handle notifications
async function handleNotifications() {
  try {
    // Get all notification tokens with pagination
    const { notificationTokens } = await fetchNotificationTokens();
    console.log("Found tokens:", notificationTokens.length);
    
    // Filter for enabled tokens only
    const enabledTokens = notificationTokens.filter(token => token.status === 'enabled');
    console.log("Enabled tokens:", enabledTokens.length);
    
    if (enabledTokens.length === 0) {
      console.log("No users have enabled notifications");
      return {
        success: true,
        message: "No enabled notification tokens found",
        stats: {
          totalTokens: notificationTokens.length,
          enabledTokens: 0,
          processed: 0,
          successful: 0,
          failed: 0,
          noToken: 0
        }
      };
    }
    
    // Process tokens in batches of 100 with 1s delay
    const results = await processBatch(enabledTokens, 100, 1000, 3);
    
    // Calculate statistics
    const stats = {
      totalTokens: notificationTokens.length,
      enabledTokens: enabledTokens.length,
      processed: results.length,
      successful: results.filter(r => r.result.state === "success").length,
      failed: results.filter(r => r.result.state === "error").length,
      noToken: results.filter(r => r.result.state === "no_token").length
    };
    
    console.log("Notification sending complete", stats);
    
    // Consider it a success if we have at least some successful notifications
    const success = stats.successful > 0;
    
    return {
      success,
      message: success ? "Notifications sent successfully" : "No notifications were sent successfully",
      stats
    };
  } catch (error) {
    console.error("Error in handleNotifications:", error);
    return {
      success: false,
      error: "Failed to send notifications",
      details: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log("Received request to send daily notifications");
    
    // Verify GitHub Actions secret
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("No authorization header");
      return Response.json({ 
        success: false, 
        error: "Unauthorized" 
      }, { status: 401 });
    }

    const secret = authHeader.split(' ')[1];
    if (secret !== process.env.GITHUB_ACTIONS_SECRET) {
      console.log("Invalid secret");
      return Response.json({ 
        success: false, 
        error: "Invalid secret" 
      }, { status: 401 });
    }

    // Verify Neynar client initialization
    try {
      getNeynarClient();
      console.log("Neynar client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Neynar client:", error);
      return Response.json({ 
        success: false, 
        error: "Failed to initialize notification service",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    // Process notifications and wait for completion
    const result = await handleNotifications();
    
    if (!result.success) {
      return Response.json(result, { status: 500 });
    }

    return Response.json(result);
  } catch (error) {
    console.error("Top-level error in send-daily-notification:", error);
    return Response.json({ 
      success: false, 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 