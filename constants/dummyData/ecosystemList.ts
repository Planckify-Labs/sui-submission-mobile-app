import {
  Coins,
  Globe,
  Rocket,
  ShoppingBag,
  TrendingUp,
  Zap,
} from "lucide-react-native";
import React from "react";

export interface TDApp {
  id: string;
  name: string;
  description: string;
  url: string;
  logoUrl: string;
  isPopular?: boolean;
}

export interface TPromotionalItem {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  url: string;
  imageUrl: string;
  backgroundColor: string;
  textColor: string;
  isSponsored?: boolean;
}

export interface TDAppCategory {
  id: string;
  title: string;
  description: string;
  icon: (isActive: boolean) => React.ReactNode;
  color: string;
  dapps: TDApp[];
}

export const getPromotionalItems = (): TPromotionalItem[] => [
  {
    id: "uniswap-promo",
    title: "Trade on Uniswap",
    subtitle: "#1 DEX on Ethereum",
    description: "Swap tokens with the best liquidity and lowest fees",
    url: "https://app.uniswap.org",
    imageUrl: "https://cryptologos.cc/logos/uniswap-uni-logo.png",
    backgroundColor: "#FF007A",
    textColor: "#FFFFFF",
    isSponsored: true,
  },
  {
    id: "aave-promo",
    title: "Earn with Aave",
    subtitle: "Leading DeFi Protocol",
    description: "Lend, borrow, and earn interest on your crypto assets",
    url: "https://app.aave.com",
    imageUrl: "https://cryptologos.cc/logos/aave-aave-logo.png",
    backgroundColor: "#B6509E",
    textColor: "#FFFFFF",
    isSponsored: true,
  },
  {
    id: "axie-promo",
    title: "Play Axie Infinity",
    subtitle: "Play-to-Earn Gaming",
    description: "Battle, breed, and earn in the most popular NFT game",
    url: "https://axieinfinity.com",
    imageUrl: "https://cryptologos.cc/logos/axie-infinity-axs-logo.png",
    backgroundColor: "#4285F4",
    textColor: "#FFFFFF",
  },
  {
    id: "opensea-promo",
    title: "Discover NFTs",
    subtitle: "OpenSea Marketplace",
    description: "Buy, sell, and discover exclusive digital items",
    url: "https://opensea.io",
    imageUrl:
      "https://storage.googleapis.com/opensea-static/Logomark/Logomark-Blue.png",
    backgroundColor: "#2081E2",
    textColor: "#FFFFFF",
  },
  {
    id: "pancakeswap-promo",
    title: "PancakeSwap",
    subtitle: "Top BSC DEX",
    description: "Trade, earn, and win crypto on the most popular DEX",
    url: "https://pancakeswap.finance",
    imageUrl: "https://cryptologos.cc/logos/pancakeswap-cake-logo.png",
    backgroundColor: "#1FC7D4",
    textColor: "#FFFFFF",
  },
];

export const getPopularDApps = (): TDApp[] => [
  {
    id: "uniswap",
    name: "Uniswap",
    description: "The largest DEX on Ethereum",
    url: "https://app.uniswap.org",
    logoUrl: "https://cryptologos.cc/logos/uniswap-uni-logo.png",
    isPopular: true,
  },
  {
    id: "aave",
    name: "Aave",
    description: "Decentralized lending protocol",
    url: "https://app.aave.com",
    logoUrl: "https://cryptologos.cc/logos/aave-aave-logo.png",
    isPopular: true,
  },
  {
    id: "opensea",
    name: "OpenSea",
    description: "The largest NFT marketplace",
    url: "https://opensea.io",
    logoUrl:
      "https://storage.googleapis.com/opensea-static/Logomark/Logomark-Blue.png",
    isPopular: true,
  },
  {
    id: "1inch",
    name: "1inch",
    description: "DEX aggregator for best prices",
    url: "https://app.1inch.io",
    logoUrl: "https://cryptologos.cc/logos/1inch-1inch-logo.png",
    isPopular: true,
  },
  {
    id: "pancakeswap",
    name: "PancakeSwap",
    description: "Leading DEX on BSC",
    url: "https://pancakeswap.finance",
    logoUrl: "https://cryptologos.cc/logos/pancakeswap-cake-logo.png",
    isPopular: true,
  },
  {
    id: "curve",
    name: "Curve Finance",
    description: "Stablecoin exchange",
    url: "https://curve.fi",
    logoUrl: "https://cryptologos.cc/logos/curve-dao-token-crv-logo.png",
    isPopular: true,
  },
  {
    id: "blur",
    name: "Blur",
    description: "Pro NFT marketplace",
    url: "https://blur.io",
    logoUrl: "https://blur.io/favicon.ico",
    isPopular: true,
  },
  {
    id: "dextools",
    name: "DEXTools",
    description: "Trading analytics platform",
    url: "https://www.dextools.io",
    logoUrl: "https://www.dextools.io/favicon.ico",
    isPopular: true,
  },
];

export const getWeb3EcosystemCategories = (): TDAppCategory[] => [
  {
    id: "dex",
    title: "Decentralized Exchange",
    description: "Trade tokens directly from your wallet",
    icon: (isActive: boolean) =>
      React.createElement(Coins, {
        color: isActive ? "white" : "#c71c4b",
        size: 24,
      }),
    color: "bg-light-primary-red/10",
    dapps: [
      {
        id: "uniswap",
        name: "Uniswap",
        description: "The largest DEX on Ethereum",
        url: "https://app.uniswap.org",
        logoUrl: "https://cryptologos.cc/logos/uniswap-uni-logo.png",
        isPopular: true,
      },
      {
        id: "1inch",
        name: "1inch",
        description: "DEX aggregator for best prices",
        url: "https://app.1inch.io",
        logoUrl: "https://cryptologos.cc/logos/1inch-1inch-logo.png",
        isPopular: true,
      },
      {
        id: "sushiswap",
        name: "SushiSwap",
        description: "Community-driven DEX",
        url: "https://www.sushi.com/swap",
        logoUrl: "https://cryptologos.cc/logos/sushiswap-sushi-logo.png",
      },
      {
        id: "pancakeswap",
        name: "PancakeSwap",
        description: "Leading DEX on BSC",
        url: "https://pancakeswap.finance",
        logoUrl: "https://cryptologos.cc/logos/pancakeswap-cake-logo.png",
      },
      {
        id: "curve",
        name: "Curve Finance",
        description: "Stablecoin exchange",
        url: "https://curve.fi",
        logoUrl: "https://cryptologos.cc/logos/curve-dao-token-crv-logo.png",
      },
    ],
  },
  {
    id: "defi",
    title: "DeFi Protocols",
    description: "Lending, borrowing, and yield farming",
    icon: (isActive: boolean) =>
      React.createElement(TrendingUp, {
        color: isActive ? "white" : "#c71c4b",
        size: 24,
      }),
    color: "bg-light-primary-red/10",
    dapps: [
      {
        id: "aave",
        name: "Aave",
        description: "Decentralized lending protocol",
        url: "https://app.aave.com",
        logoUrl: "https://cryptologos.cc/logos/aave-aave-logo.png",
        isPopular: true,
      },
      {
        id: "compound",
        name: "Compound",
        description: "Algorithmic money markets",
        url: "https://app.compound.finance",
        logoUrl: "https://cryptologos.cc/logos/compound-comp-logo.png",
      },
      {
        id: "yearn",
        name: "Yearn Finance",
        description: "Yield optimization strategies",
        url: "https://yearn.fi",
        logoUrl: "https://cryptologos.cc/logos/yearn-finance-yfi-logo.png",
      },
      {
        id: "makerdao",
        name: "MakerDAO",
        description: "Decentralized stablecoin platform",
        url: "https://makerdao.com",
        logoUrl: "https://cryptologos.cc/logos/maker-mkr-logo.png",
      },
    ],
  },
  {
    id: "launchpad",
    title: "Launchpads",
    description: "Discover and invest in new projects",
    icon: (isActive: boolean) =>
      React.createElement(Rocket, {
        color: isActive ? "white" : "#c71c4b",
        size: 24,
      }),
    color: "bg-light-primary-red/10",
    dapps: [
      {
        id: "pinksale",
        name: "PinkSale",
        description: "Decentralized launchpad",
        url: "https://www.pinksale.finance",
        logoUrl: "https://www.pinksale.finance/favicon.ico",
        isPopular: true,
      },
      {
        id: "dxsale",
        name: "DxSale",
        description: "Token launch platform",
        url: "https://dxsale.app",
        logoUrl: "https://dxsale.app/favicon.ico",
      },
      {
        id: "gempad",
        name: "GemPad",
        description: "Multi-chain launchpad",
        url: "https://gempad.app",
        logoUrl: "https://gempad.app/favicon.ico",
      },
    ],
  },
  {
    id: "nft",
    title: "NFT Marketplaces",
    description: "Buy, sell, and trade NFTs",
    icon: (isActive: boolean) =>
      React.createElement(ShoppingBag, {
        color: isActive ? "white" : "#c71c4b",
        size: 24,
      }),
    color: "bg-light-primary-red/10",
    dapps: [
      {
        id: "opensea",
        name: "OpenSea",
        description: "The largest NFT marketplace",
        url: "https://opensea.io",
        logoUrl:
          "https://storage.googleapis.com/opensea-static/Logomark/Logomark-Blue.png",
        isPopular: true,
      },
      {
        id: "blur",
        name: "Blur",
        description: "Pro NFT marketplace",
        url: "https://blur.io",
        logoUrl: "https://blur.io/favicon.ico",
        isPopular: true,
      },
      {
        id: "rarible",
        name: "Rarible",
        description: "Community-owned NFT marketplace",
        url: "https://rarible.com",
        logoUrl: "https://rarible.com/favicon.ico",
      },
      {
        id: "foundation",
        name: "Foundation",
        description: "Curated NFT platform",
        url: "https://foundation.app",
        logoUrl: "https://foundation.app/favicon.ico",
      },
    ],
  },
  {
    id: "gaming",
    title: "Gaming & Metaverse",
    description: "Play-to-earn games and virtual worlds",
    icon: (isActive: boolean) =>
      React.createElement(Zap, {
        color: isActive ? "white" : "#c71c4b",
        size: 24,
      }),
    color: "bg-light-primary-red/10",
    dapps: [
      {
        id: "decentraland",
        name: "Decentraland",
        description: "Virtual reality platform",
        url: "https://play.decentraland.org",
        logoUrl: "https://cryptologos.cc/logos/decentraland-mana-logo.png",
        isPopular: true,
      },
      {
        id: "sandbox",
        name: "The Sandbox",
        description: "Gaming metaverse",
        url: "https://www.sandbox.game/en/",
        logoUrl: "https://cryptologos.cc/logos/the-sandbox-sand-logo.png",
      },
      {
        id: "axie",
        name: "Axie Infinity",
        description: "Play-to-earn NFT game",
        url: "https://axieinfinity.com",
        logoUrl: "https://cryptologos.cc/logos/axie-infinity-axs-logo.png",
        isPopular: true,
      },
      {
        id: "stepn",
        name: "STEPN",
        description: "Move-to-earn fitness app",
        url: "https://stepn.com",
        logoUrl: "https://stepn.com/favicon.ico",
      },
      {
        id: "illuvium",
        name: "Illuvium",
        description: "Open-world RPG game",
        url: "https://illuvium.io",
        logoUrl: "https://cryptologos.cc/logos/illuvium-ilv-logo.png",
      },
    ],
  },
  {
    id: "tools",
    title: "Web3 Tools",
    description: "Analytics, portfolio tracking, and utilities",
    icon: (isActive: boolean) =>
      React.createElement(Globe, {
        color: isActive ? "white" : "#c71c4b",
        size: 24,
      }),
    color: "bg-light-primary-red/10",
    dapps: [
      {
        id: "dextools",
        name: "DEXTools",
        description: "Trading analytics platform",
        url: "https://www.dextools.io",
        logoUrl: "https://www.dextools.io/favicon.ico",
        isPopular: true,
      },
      {
        id: "debank",
        name: "DeBank",
        description: "DeFi portfolio tracker",
        url: "https://debank.com",
        logoUrl: "https://debank.com/favicon.ico",
      },
      {
        id: "etherscan",
        name: "Etherscan",
        description: "Ethereum block explorer",
        url: "https://etherscan.io",
        logoUrl: "https://etherscan.io/favicon.ico",
      },
      {
        id: "zapper",
        name: "Zapper",
        description: "DeFi portfolio manager",
        url: "https://zapper.xyz",
        logoUrl: "https://zapper.xyz/favicon.ico",
      },
    ],
  },
];
