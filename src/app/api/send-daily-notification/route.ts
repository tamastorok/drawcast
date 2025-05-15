import { NextRequest } from "next/server";
import { sendNeynarFrameNotification, fetchNotificationTokens, getNeynarClient } from "~/lib/neynar";
import type { NotificationToken } from "~/lib/neynar";

// Simple delay helper
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

// Get random message
const getRandomMessage = () => NOTIFICATION_MESSAGES[Math.floor(Math.random() * NOTIFICATION_MESSAGES.length)];

// Simple function to send notifications
async function sendNotifications(tokens: NotificationToken[]) {
  const results = [];
  const enabledTokens = tokens.filter(token => token.status === 'enabled');
  
  console.log(`Sending notifications to ${enabledTokens.length} enabled users`);
  
  // Process 50 notifications at a time with a moderate delay between batches
  // This should process ~600 users in about 35-40 seconds
  for (let i = 0; i < enabledTokens.length; i += 50) {
    const batch = enabledTokens.slice(i, i + 50);
    const batchStartTime = Date.now();
    
    console.log(`Processing batch ${Math.floor(i/50) + 1} of ${Math.ceil(enabledTokens.length/50)} (${i + 1}-${Math.min(i + 50, enabledTokens.length)} of ${enabledTokens.length})`);
    
    // Send notifications in parallel for this batch
    const batchResults = await Promise.all(
      batch.map(async (token) => {
        try {
          const result = await sendNeynarFrameNotification({
            fid: token.fid,
            title: "Drawcast",
            body: getRandomMessage(),
            targetUrl: "https://drawcast.xyz/?utm_source=Notification&utm_medium=Daily"
          });
          
          return { fid: token.fid, success: result.state === "success" };
        } catch (error) {
          console.error(`Failed to send notification to FID ${token.fid}:`, error);
          return { fid: token.fid, success: false };
        }
      })
    );
    
    results.push(...batchResults);
    
    const batchDuration = Date.now() - batchStartTime;
    console.log(`Batch completed in ${batchDuration}ms`);
    
    // Add a moderate delay between batches
    if (i + 50 < enabledTokens.length) {
      console.log('Waiting 200ms before next batch...');
      await delay(200); // Shorter delay between batches
    }
  }
  
  const successful = results.filter(r => r.success).length;
  console.log(`Completed sending notifications. Success rate: ${successful}/${enabledTokens.length} (${Math.round(successful/enabledTokens.length * 100)}%)`);
  
  return {
    total: tokens.length,
    enabled: enabledTokens.length,
    successful,
    failed: results.filter(r => !r.success).length
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log("Starting daily notifications");
    
    // Verify GitHub Actions secret
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || authHeader.split(' ')[1] !== process.env.GITHUB_ACTIONS_SECRET) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Verify Neynar client
    try {
      getNeynarClient();
    } catch (error) {
      console.error("Failed to initialize Neynar client:", error);
      return Response.json({ 
        success: false, 
        error: "Failed to initialize notification service" 
      }, { status: 500 });
    }

    // Get tokens and send notifications
    const { notificationTokens } = await fetchNotificationTokens();
    const stats = await sendNotifications(notificationTokens);
    
    return Response.json({
      success: stats.successful > 0,
      message: stats.successful > 0 ? "Notifications sent successfully" : "No notifications were sent successfully",
      stats
    });
    
  } catch (error) {
    console.error("Error in send-daily-notification:", error);
    return Response.json({ 
      success: false, 
      error: "Failed to send notifications" 
    }, { status: 500 });
  }
} 