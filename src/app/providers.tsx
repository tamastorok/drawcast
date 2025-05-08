"use client";

import dynamic from "next/dynamic";
import type { Session } from "next-auth"
import { SessionProvider } from "next-auth/react"
import { FrameProvider } from "~/components/providers/FrameProvider";
import React from 'react'
import { DaimoPayProvider } from '@daimo/pay'

const WagmiProvider = dynamic(
  () => import("~/components/providers/WagmiProvider"),
  {
    ssr: false,
  }
);

export function Providers({ session, children }: { session: Session | null, children: React.ReactNode }) {
  return (
    <SessionProvider session={session}>
      <WagmiProvider>
        <DaimoPayProvider>
          <FrameProvider>
            {children}
          </FrameProvider>
        </DaimoPayProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}
