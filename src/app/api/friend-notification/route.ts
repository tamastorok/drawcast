import { NextRequest, NextResponse } from 'next/server';

interface NotificationDelivery {
  object: string;
  fid: number;
  status: 'success' | 'failed';
}

interface NotificationResponse {
  notification_deliveries: NotificationDelivery[];
}

interface FarcasterUser {
  object: string;
  user: {
    object: string;
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
  };
}

interface FollowersResponse {
  users: FarcasterUser[];
  next?: {
    cursor: string;
  };
}

interface NotificationToken {
  token: string;
  userId: string;
}

interface NeynarNotificationToken {
  object: string;
  url: string;
  token: string;
  status: 'enabled' | 'disabled';
  fid: number;
  created_at: string;
  updated_at: string;
}

interface NeynarNotificationResponse {
  notification_tokens: NeynarNotificationToken[];
  next?: {
    cursor: string;
  };
}

// Log environment variables (without exposing the actual key)
console.log('[Friend Notification] Environment check:', {
  hasNeynarKey: !!process.env.NEYNAR_API_KEY,
  nodeEnv: process.env.NODE_ENV
});

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

// Add validation for API key
if (!NEYNAR_API_KEY) {
  console.error('[Friend Notification] NEYNAR_API_KEY is not set in environment variables');
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFollowers(fid: number, cursor?: string): Promise<{ users: { fid: number }[], nextCursor?: string }> {
  console.log(`[Friend Notification] Fetching followers for FID ${fid}`);
  
  const url = new URL('https://api.neynar.com/v2/farcaster/followers');
  url.searchParams.append('fid', fid.toString());
  url.searchParams.append('limit', '100');
  if (cursor) {
    url.searchParams.append('cursor', cursor);
  }
  
  try {
    console.log('[Friend Notification] Request URL:', url.toString());
    console.log('[Friend Notification] Request headers:', {
      'x-api-key': NEYNAR_API_KEY ? 'Present' : 'Missing'
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': NEYNAR_API_KEY,
        'accept': 'application/json'
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Friend Notification] Failed to fetch followers:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url: url.toString()
      });
      throw new Error(`Failed to fetch followers: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as FollowersResponse;
    console.log('[Friend Notification] Followers response:', data);
    
    return {
      users: data.users.map(user => ({ fid: user.user.fid })),
      nextCursor: data.next?.cursor
    };
  } catch (error) {
    console.error('[Friend Notification] Error in fetchFollowers:', error);
    throw error;
  }
}

async function fetchNotificationTokens(fids: number[]): Promise<NotificationToken[]> {
  const logs: string[] = [];
  const addLog = (message: string) => logs.push(message);
  
  addLog(`Fetching notification tokens for ${fids.length} users`);
  const allTokens: NotificationToken[] = [];
  const batchSize = 100;

  for (let i = 0; i < fids.length; i += batchSize) {
    const batch = fids.slice(i, i + batchSize);
    addLog(`Processing batch ${i / batchSize + 1} with ${batch.length} users`);

    try {
      const url = new URL('https://api.neynar.com/v2/farcaster/frame/notification_tokens');
      url.searchParams.append('fids', batch.map(fid => fid.toString()).join(','));
      url.searchParams.append('limit', batchSize.toString());

      addLog(`Request URL: ${url.toString()}`);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': NEYNAR_API_KEY,
          'accept': 'application/json'
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        addLog(`Failed to fetch notification tokens: ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to fetch notification tokens: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as NeynarNotificationResponse;
      
      // Map the response to match our NotificationToken interface
      const tokens = (data.notification_tokens || [])
        .filter(token => token.status === 'enabled') // Only use enabled tokens
        .map((token) => ({
          token: token.token,
          userId: token.fid.toString()
        }));
      
      addLog(`Found ${tokens.length} enabled notification tokens in batch ${i / batchSize + 1}`);
      allTokens.push(...tokens);

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < fids.length) {
        await delay(100);
      }
    } catch (error) {
      addLog(`Error processing batch ${i / batchSize + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  addLog(`Total enabled notification tokens found: ${allTokens.length}`);
  return allTokens;
}

async function sendNotification(fids: number[], username: string, gameUrl: string) {
  console.log(`[Friend Notification] Attempting to send notifications to ${fids.length} users`);
  
  try {
    const url = 'https://api.neynar.com/v2/farcaster/frame/notifications';
    const requestBody = {
      target_fids: fids,
      notification: {
        title: 'Drawcast',
        body: `${username} just drew something on Drawcast! Check it out!`,
        target_url: gameUrl
      }
    };

    console.log('[Friend Notification] Sending notification request:', {
      url,
      fids,
      username,
      gameUrl
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': NEYNAR_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[Friend Notification] Response status:', response.status);
    console.log('[Friend Notification] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Friend Notification] Failed to send notifications:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        requestBody
      });

      if (response.status === 429) {
        console.log(`[Friend Notification] Rate limited - waiting before retry`);
        await delay(1000); // Wait 1 second before retrying
        return sendNotification(fids, username, gameUrl); // Retry once
      }

      throw new Error(`Failed to send notifications: ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json() as NotificationResponse;
    console.log('[Friend Notification] Notification response:', responseData);
    
    const successfulDeliveries = responseData.notification_deliveries?.filter(
      (delivery) => delivery.status === 'success'
    ).length || 0;
    
    console.log(`[Friend Notification] Successfully sent notifications to ${successfulDeliveries} users`);
    return successfulDeliveries;
  } catch (error) {
    console.error('[Friend Notification] Error in sendNotification:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const logs: string[] = [];
  const addLog = (message: string) => logs.push(message);
  
  try {
    const { fid, username, gameUrl } = await request.json();
    addLog(`Request parameters: ${JSON.stringify({ fid, username, gameUrl })}`);

    if (!fid || !username || !gameUrl) {
      addLog('Missing required parameters');
      throw new Error('Missing required parameters: fid, username, or gameUrl');
    }

    // Fetch all followers using pagination
    let allFollowers: { fid: number }[] = [];
    let nextCursor: string | undefined;
    let totalPages = 0;

    do {
      addLog(`Fetching followers page ${totalPages + 1}`);
      const { users: followers, nextCursor: cursor } = await fetchFollowers(fid, nextCursor);
      addLog(`Fetched ${followers.length} followers on page ${totalPages + 1}`);
      
      allFollowers = [...allFollowers, ...followers];
      nextCursor = cursor;
      totalPages++;

      // Add a small delay between requests to avoid rate limiting
      if (nextCursor) {
        await delay(100);
      }
    } while (nextCursor && totalPages < 10); // Limit to 10 pages to avoid excessive requests

    addLog(`Total followers fetched: ${allFollowers.length} across ${totalPages} pages`);

    if (allFollowers.length === 0) {
      addLog('No followers found');
      return NextResponse.json({ 
        success: true, 
        totalFollowers: 0, 
        notificationsSent: 0,
        logs 
      });
    }

    // Get notification tokens for all followers
    const fids = allFollowers.map(f => f.fid);
    const tokens = await fetchNotificationTokens(fids);
    addLog(`Found ${tokens.length} followers with notifications enabled`);

    if (tokens.length === 0) {
      addLog('No followers with notifications enabled');
      return NextResponse.json({
        success: true,
        totalFollowers: allFollowers.length,
        selectedFollowers: 0,
        notificationsSent: 0,
        failedNotifications: 0,
        pagesFetched: totalPages,
        logs
      });
    }

    // Randomly select up to 5 followers from those with notifications enabled
    const MAX_NOTIFICATIONS = 5;
    const selectedTokens = tokens
      .sort(() => Math.random() - 0.5) // Shuffle array
      .slice(0, MAX_NOTIFICATIONS);

    addLog(`Selected ${selectedTokens.length} random followers with notifications enabled`);
    addLog(`Selected FIDs: ${selectedTokens.map(t => t.userId).join(', ')}`);

    // Send notifications to selected followers
    const selectedFids = selectedTokens.map(t => parseInt(t.userId));
    let notificationsSent = 0;
    let failedNotifications = 0;
    
    try {
      addLog(`Sending notifications to ${selectedFids.length} selected users`);
      const successfulDeliveries = await sendNotification(selectedFids, username, gameUrl);
      notificationsSent = successfulDeliveries;
      addLog(`Successfully sent ${successfulDeliveries} notifications`);
    } catch (error) {
      addLog(`Failed to send notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failedNotifications = selectedFids.length;
    }

    addLog('Notification sending complete');

    return NextResponse.json({
      success: true,
      totalFollowers: allFollowers.length,
      enabledFollowers: tokens.length,
      selectedFollowers: selectedTokens.length,
      notificationsSent,
      failedNotifications,
      pagesFetched: totalPages,
      logs,
      selectedFids: selectedFids
    });
  } catch (error) {
    addLog(`Error in notification process: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process notifications',
        logs 
      },
      { status: 500 }
    );
  }
} 