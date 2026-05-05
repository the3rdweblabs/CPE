// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  rainbowWallet,
  trustWallet,
  metaMaskWallet,
  phantomWallet,
  coinbaseWallet,
  uniswapWallet,
  rabbyWallet,
  ledgerWallet,
  safeWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http, fallback } from 'wagmi';
// import { polygon, arbitrum, optimism, base } from 'wagmi/chains';
import { sepolia, mainnet } from 'wagmi/chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '86e2467b93198f121d595c2e36e84d43';
console.log('[wagmi] Using WalletConnect projectId:', projectId);

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        injectedWallet,
        rainbowWallet,
        metaMaskWallet,
        trustWallet,
        phantomWallet,
        coinbaseWallet,
        walletConnectWallet,
      ],
    },
    {
      groupName: 'More Wallets',
      wallets: [
        rabbyWallet,
        uniswapWallet,
        ledgerWallet,
        safeWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: 'ConfidentialVault | CPE Demo',
    projectId,
  }
);

const network = import.meta.env.VITE_NETWORK || 'sepolia';
console.log('[wagmi] Active network setting:', network);

const chains = network === 'mainnet'
  ? ([mainnet, sepolia] as const)
  : ([sepolia, mainnet] as const);

export const wagmiConfig = createConfig({
  connectors,
  chains,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: fallback([
      ...(import.meta.env.VITE_INFURA_API_KEY ? [http(`https://sepolia.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY}`)] : []),
      http('https://ethereum-sepolia-rpc.publicnode.com'),
      http('https://sepolia.drpc.org'),
      http('https://rpc.ankr.com/eth_sepolia'),
      http(),
    ]),
    //  [polygon.id]: http(),
    //  [arbitrum.id]: http(),
    //  [optimism.id]: http(),
    //  [base.id]: http(),
  },
  ssr: false,
});
