import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { createFarcasterConnector } from '@farcaster/frame-wagmi-connector'

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    createFarcasterConnector({
      options: {
        // You can add any Farcaster-specific options here
      }
    })
  ]
}) 