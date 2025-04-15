import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";

let neynarClient: NeynarAPIClient | null = null;

// Example usage:
// const client = getNeynarClient();
// const user = await client.lookupUserByFid(fid); 
export function getNeynarClient(): NeynarAPIClient {
  if (!neynarClient) {
    if (!process.env.NEYNAR_API_KEY) {
      throw new Error("NEYNAR_API_KEY is not set in environment variables");
    }
    const config = new Configuration({ apiKey: process.env.NEYNAR_API_KEY });
    neynarClient = new NeynarAPIClient(config);
  }
  return neynarClient;
}

export async function sendNeynarFrameNotification({
  fid,
  title,
  body,
  targetUrl
}: {
  fid: string;
  title: string;
  body: string;
  targetUrl?: string;
}) {
  const client = getNeynarClient();
  
  try {
    // Send the notification using Neynar's FID-based system
    const response = await client.publishFrameNotifications({
      targetFids: [parseInt(fid)],
      notification: {
        title,
        body,
        target_url: targetUrl || 'https://drawcast.xyz'
      }
    });

    return response;
  } catch (error) {
    console.error(`Error sending notification to FID ${fid}:`, error);
    throw error;
  }
} 