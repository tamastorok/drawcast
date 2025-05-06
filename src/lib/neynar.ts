import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

let neynarClient: NeynarAPIClient | null = null;

export interface NotificationToken {
  fid: number;
  token: string;
  url: string;
  status: 'enabled' | 'disabled';
}

type SendFrameNotificationResult =
  | { state: "success" }
  | { state: "no_token" }
  | { state: "error"; error: unknown };

interface NotificationTokensResponse {
  notificationTokens: NotificationToken[];
  nextCursor: string | null;
}

export function getNeynarClient(): NeynarAPIClient {
  try {
    if (!neynarClient) {
      const apiKey = process.env.NEYNAR_API_KEY;
      console.log("Checking NEYNAR_API_KEY environment variable...");
      
      if (!apiKey) {
        console.error("NEYNAR_API_KEY is not set in environment variables");
        throw new Error('NEYNAR_API_KEY not configured');
      }
      
      console.log("NEYNAR_API_KEY found, length:", apiKey.length);
      console.log("Initializing Neynar client...");
      
      const config = new Configuration({ 
        apiKey,
        basePath: 'https://api.neynar.com/v2' // Explicitly set the base path
      });
      neynarClient = new NeynarAPIClient(config);
      
      console.log("Neynar client initialized successfully");
    }
    return neynarClient;
  } catch (error) {
    console.error("Error in getNeynarClient:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    throw error;
  }
}

export async function fetchNotificationTokens(limit?: number, cursor?: string): Promise<NotificationTokensResponse> {
  try {
    const client = getNeynarClient();
    let allTokens: NotificationToken[] = [];
    let currentCursor: string | undefined = cursor;
    let pageCount = 0;
    
    do {
      pageCount++;
      console.log(`Fetching page ${pageCount}${currentCursor ? ` with cursor: ${currentCursor}` : ''}`);
      
      const response = await client.fetchNotificationTokens({ 
        limit: 100, // Always fetch 100 per page
        cursor: currentCursor // Pass the cursor to get the next page
      });
      
      // Filter out any tokens with missing required fields
      const tokens = response.notification_tokens
        .filter(token => token.fid && token.token && token.url && token.status)
        .map(token => ({
          fid: token.fid!,
          token: token.token!,
          url: token.url!,
          status: token.status as 'enabled' | 'disabled'
        }));
      
      console.log(`Page ${pageCount} results:`, {
        tokensInPage: tokens.length,
        totalTokensSoFar: allTokens.length + tokens.length,
        nextCursor: response.next?.cursor
      });
      
      allTokens = [...allTokens, ...tokens];
      
      // Get the cursor for the next page
      currentCursor = response.next?.cursor || undefined;
      
      // Break only if there are no more pages
      if (!currentCursor) {
        break;
      }
      
    } while (true);
    
    console.log('Pagination complete:', {
      totalPages: pageCount,
      totalTokens: allTokens.length,
      enabledTokens: allTokens.filter(t => t.status === 'enabled').length
    });
    
    return {
      notificationTokens: allTokens,
      nextCursor: currentCursor || null
    };
  } catch (error) {
    console.error("Error fetching notification tokens:", error);
    return {
      notificationTokens: [],
      nextCursor: null
    };
  }
}

export async function sendNeynarFrameNotification({
  fid,
  title,
  body,
  targetUrl
}: {
  fid: number;
  title: string;
  body: string;
  targetUrl?: string;
}): Promise<SendFrameNotificationResult> {
  try {
    const client = getNeynarClient();
    const targetFids = [fid];
    
    // Ensure the URL has the protocol and is properly formatted
    const baseUrl = targetUrl || process.env.NEXT_PUBLIC_URL || 'https://drawcast.xyz';
    const finalTargetUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

    const notification = {
      title,
      body,
      target_url: finalTargetUrl,
    };

    console.log("Sending notification with payload:", {
      targetFids,
      notification,
      targetUrl: finalTargetUrl
    });

    const result = await client.publishFrameNotifications({ 
      targetFids, 
      notification 
    });

    console.log("Notification result:", result);

    if (result.notification_deliveries.length > 0) {
      return { state: "success" };
    } else if (result.notification_deliveries.length === 0) {
      return { state: "no_token" };
    } else {
      return { state: "error", error: result || "Unknown error" };
    }
  } catch (error) {
    console.error("Error sending notification:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack
      });
    }
    return { state: "error", error };
  }
} 