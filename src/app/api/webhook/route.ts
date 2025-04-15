import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received webhook event:", body);

    // Just log the event type
    const { event, fid } = body;
    console.log(`Received ${event} event for FID ${fid}`);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error handling webhook:", error);
    return Response.json({ 
      success: false, 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
