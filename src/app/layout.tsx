import type { Metadata } from "next";
import { getSession } from "~/auth"
import "~/app/globals.css";
import { Providers } from "~/app/providers";

export async function generateMetadata(
  { params }: { params: { gameId?: string } }
): Promise<Metadata> {
  const isGamePage = params.gameId !== undefined;

  const baseMetadata = {
    title: process.env.NEXT_PUBLIC_FRAME_NAME || "Drawcast",
    description: process.env.NEXT_PUBLIC_FRAME_DESCRIPTION || "Draw something and challenge your friends",
    viewport: {
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
    }
  };

  // Only add frame metadata if we're not on a game page
  if (!isGamePage) {
    return {
      ...baseMetadata,
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
  }

  return baseMetadata;
}

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
