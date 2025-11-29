import { ShoppingBag, Sparkles, Wallet } from "lucide-react-native";

export const ONBOARDING_SLIDE_DATA = [
  {
    icon: Sparkles,
    iconColor: "#c71c4b",
    iconBgColor: "#fef2f2",
    accentColor: "#c71c4b",
    title: "Meet Your AI Wallet Agent",
    description:
      "Your personal assistant for managing crypto and shopping through natural conversations.",
    features: [
      "Natural language transaction execution",
      "Secure server-side wallet architecture",
      "Multi-chain blockchain support",
    ],
  },
  {
    icon: Wallet,
    iconColor: "#059669",
    iconBgColor: "#ecfdf5",
    accentColor: "#059669",
    title: "On-Chain Actions",
    description:
      "Send tokens, check balances, and monitor gas fees across multiple chains.",
    features: [
      "Native tokens: ETH, MATIC, BNB",
      "ERC-20: USDT, USDC, DAI & more",
      "NFT transfers (ERC-721)",
      "Real-time gas estimates",
    ],
  },
  {
    icon: ShoppingBag,
    iconColor: "#7c3aed",
    iconBgColor: "#faf5ff",
    accentColor: "#7c3aed",
    title: "Shop via Chat",
    description:
      "Browse products and complete purchases directly in your conversation.",
    features: [
      "Full product catalog access",
      "Filter by category & price",
      "One-command purchases",
    ],
  },
];

