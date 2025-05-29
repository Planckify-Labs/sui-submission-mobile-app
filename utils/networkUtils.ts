import { TNetwork } from "@/constants/types/networkTypes";

export const ALL_NETWORKS: TNetwork[] = [
  {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    color: "#627EEA",
    isPinned: true,
  },
  {
    id: "polygon",
    name: "Polygon",
    symbol: "MATIC",
    color: "#8247E5",
    isPinned: true,
  },
  {
    id: "binance",
    name: "BNB Chain",
    symbol: "BNB",
    color: "#F3BA2F",
    isPinned: true,
  },
  {
    id: "solana",
    name: "Solana",
    symbol: "SOL",
    color: "#14F195",
    isPinned: true,
  },
  {
    id: "avalanche",
    name: "Avalanche",
    symbol: "AVAX",
    color: "#E84142",
    isPinned: true,
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    symbol: "ARB",
    color: "#28A0F0",
    isPinned: false,
  },
  {
    id: "optimism",
    name: "Optimism",
    symbol: "OP",
    color: "#FF0420",
    isPinned: false,
  },
  {
    id: "base",
    name: "Base",
    symbol: "ETH",
    color: "#0052FF",
    isPinned: false,
  },
  {
    id: "fantom",
    name: "Fantom",
    symbol: "FTM",
    color: "#1969FF",
    isPinned: false,
  },
  {
    id: "cronos",
    name: "Cronos",
    symbol: "CRO",
    color: "#002D74",
    isPinned: false,
  },
];

export function getPinnedNetworks(): TNetwork[] {
  return ALL_NETWORKS.filter((network) => network.isPinned);
}

export function toggleNetworkPin(networkId: string): TNetwork[] {
  const updatedNetworks = ALL_NETWORKS.map((network) => {
    if (network.id === networkId) {
      return { ...network, isPinned: !network.isPinned };
    }
    return network;
  });

  return updatedNetworks;
}

export function filterNetworks(
  networks: TNetwork[],
  searchQuery: string,
): TNetwork[] {
  if (!searchQuery) return networks;

  const query = searchQuery.toLowerCase();
  return networks.filter(
    (network) =>
      network.name.toLowerCase().includes(query) ||
      network.symbol.toLowerCase().includes(query),
  );
}
export { TNetwork as Network };
