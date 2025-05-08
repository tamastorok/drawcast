import { createConfig, http, WagmiProvider } from "wagmi";
import { base, degen, mainnet, optimism, unichain } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { getDefaultConfig } from '@daimo/pay';

// Create a client
const queryClient = new QueryClient();

// Create Wagmi config with Daimo's default config
export const config = createConfig(
  getDefaultConfig({
    appName: 'Drawcast',
    chains: [base, optimism, mainnet, degen, unichain],
    transports: {
      [base.id]: http(),
      [optimism.id]: http(),
      [mainnet.id]: http(),
      [degen.id]: http(),
      [unichain.id]: http(),
    },
    connectors: [farcasterFrame()],
  })
);

export default function Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
