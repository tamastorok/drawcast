import type { Metadata } from "next";
import { getSession } from "~/auth"
import "~/app/globals.css";
import { Providers } from "~/app/providers";

// Static metadata for the root layout
export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_FRAME_NAME || "Drawcast",
  description: process.env.NEXT_PUBLIC_FRAME_DESCRIPTION || "Draw something and challenge your friends",
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  other: {
    'fc:frame': JSON.stringify({
      version: "next",
      imageUrl: "https://drawcast.xyz/image.png",
      aspectRatio: "3:2",
      button: {
        title: "Draw",
        action: {
          type: "launch_frame",
          name: "Drawcast",
          url: "https://drawcast.xyz",
          splashImageUrl: "https://drawcast.xyz/splash.png",
          splashBackgroundColor: "#FFF"
        }
      }
    })
  }
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {  
  const session = await getSession()

  return (
    <html lang="en">
      <body style={{ overscrollBehavior: 'none', touchAction: 'none' }}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
