import { NextRequest } from "next/server";
import { sendNeynarFrameNotification } from "~/lib/neynar";

export async function POST(request: NextRequest) {
  try {
    // Verify GitHub Actions secret
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const secret = authHeader.split(' ')[1];
    if (secret !== process.env.GITHUB_ACTIONS_SECRET) {
      return Response.json({ success: false, error: "Invalid secret" }, { status: 401 });
    }

    // Send notification to a test FID
    const response = await sendNeynarFrameNotification({
      fid: "234692", // Your FID
      title: "Drawcast",
      body: "Time to draw and challenge your friends!",
      targetUrl: "https://drawcast.xyz"
    });

    return Response.json({ success: true, result: response });
  } catch (error) {
    console.error("Error sending daily notification:", error);
    return Response.json({ 
      success: false, 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 