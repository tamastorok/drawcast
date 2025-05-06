import { NextRequest } from "next/server";
import { sendNeynarFrameNotification, fetchNotificationTokens, getNeynarClient } from "~/lib/neynar";
import type { NotificationToken } from "~/lib/neynar";

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to process tokens in batches
async function processBatch(tokens: NotificationToken[], batchSize: number = 100, delayMs: number = 1000) {
  const results = [];
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1} of ${Math.ceil(tokens.length/batchSize)}`);
    
    const batchResults = await Promise.all(
      batch.map(async (token) => {
        console.log("Sending notification to FID:", token.fid);
        try {
          const result = await sendNeynarFrameNotification({
            fid: token.fid,
            title: "Drawcast",
            body: "Time to draw and challenge your friends!",
            targetUrl: "https://drawcast.xyz"
          });
          return { fid: token.fid, result };
        } catch (error) {
          console.error(`Error sending notification to FID ${token.fid}:`, error);
          return { fid: token.fid, result: { state: "error", error } };
        }
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

    // Get all notification tokens with pagination
    const { notificationTokens } = await fetchNotificationTokens();
    console.log("Found tokens:", notificationTokens.length);
    
    // Filter for enabled tokens only
    const enabledTokens = notificationTokens.filter(token => token.status === 'enabled');
    console.log("Enabled tokens:", enabledTokens.length);
    
    if (enabledTokens.length === 0) {
      return Response.json({ 
        success: true, 
        message: "No users have enabled notifications" 
      });
    }
    
    // Process tokens in batches
    const results = await processBatch(enabledTokens, 10, 1000);
    
    console.log("Notifications sent successfully");
    return Response.json({ 
      success: true, 
      results,
      totalEnabledTokens: enabledTokens.length
    });
  } catch (error) {
    console.error("Top-level error in send-daily-notification:", error);
    return Response.json({ 
      success: false, 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 