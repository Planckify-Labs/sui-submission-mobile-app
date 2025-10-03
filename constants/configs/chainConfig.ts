import {
  bsc,
  goerli,
  mainnet,
  polygon,
  polygonMumbai,
  type Chain as TChain,
} from "viem/chains";

export interface ChainConfig {
  chain: TChain;
  iconUrl?: string;
  isTestnet?: boolean;
}

export const supportedChains: ChainConfig[] = [
  {
    chain: mainnet,
    iconUrl:
      "https://ethereum.org/static/6b935ac0e6194247347855dc3d328e83/13c43/eth-diamond-black.png",
  },
  {
    chain: polygon,
    iconUrl: "https://polygon.technology/favicon.ico",
  },
  {
    chain: bsc,
    iconUrl: "https://bscscan.com/images/svg/brands/bnb.svg",
  },
  {
    chain: goerli,
    iconUrl:
      "https://ethereum.org/static/6b935ac0e6194247347855dc3d328e83/13c43/eth-diamond-black.png",
    isTestnet: true,
  },
  {
    chain: polygonMumbai,
    iconUrl: "https://polygon.technology/favicon.ico",
    isTestnet: true,
  },
];
