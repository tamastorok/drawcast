import { NextRequest } from "next/server";
import { fetchNotificationTokens } from "~/lib/neynar";

export async function GET(request: NextRequest) {
  try {
    console.log("Received request to test notification tokens");
    
    // Check API key
    const apiKey = request.headers.get('x-api-key');
    console.log("API key present:", !!apiKey);
    
    if (!apiKey) {
      console.log("No API key");
      return Response.json({ 
        success: false, 
        error: "Unauthorized" 
      }, { status: 401 });
    }

    const expectedApiKey = process.env.NEYNAR_API_KEY;
    
    if (!expectedApiKey) {
      console.error("NEYNAR_API_KEY not set in environment");
      return Response.json({ 
        success: false, 
        error: "Server configuration error" 
      }, { status: 500 });
    }
    
    if (apiKey !== expectedApiKey) {
      console.log("Invalid API key");
      return Response.json({ 
        success: false, 
        error: "Invalid API key" 
      }, { status: 401 });
    }

    // Get limit from query parameter, default to 20 (matching Neynar's default)
    const limit = request.nextUrl.searchParams.get('limit');
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    
    // Get cursor from query parameter
    const cursor = request.nextUrl.searchParams.get('cursor');
    
    // Get notification tokens with pagination
    const { notificationTokens, nextCursor } = await fetchNotificationTokens(limitNumber, cursor || undefined);
    console.log("Found tokens:", notificationTokens.length);
    
    // Return in Neynar API format
    return Response.json({
      notification_tokens: notificationTokens,
      next: nextCursor ? { cursor: nextCursor } : null
    });
  } catch (error) {
    console.error("Error in test-notification-tokens:", error);
    return Response.json({ 
      success: false, 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 