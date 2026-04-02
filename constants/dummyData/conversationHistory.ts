export interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessageProps[];
}

export const DUMMY_CHAT_SESSIONS: ChatSession[] = [
  {
    id: "session-1",
    title: "Transfer 20 USDT to Andre",
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: "Transfer 20 USDT to Andre",
        timestamp: new Date("2024-11-01T10:30:00"),
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "I understood you want to transfer 20 USDT to Andre. Let me help you with that! I'll prepare the transaction to send 20 USDT to Andre's wallet address (0x742d35Cc6634C0532925a3b844Bc9e7595f42bE).",
        timestamp: new Date("2024-11-01T10:30:05"),
      },
      {
        id: "msg-3",
        role: "user",
        content: "Yes, please proceed",
        timestamp: new Date("2024-11-01T10:30:15"),
      },
      {
        id: "msg-4",
        role: "assistant",
        content:
          "Transaction initiated! The transfer of 20 USDT to Andre is being processed. You can track the transaction status in your wallet.",
        timestamp: new Date("2024-11-01T10:30:20"),
      },
    ],
  },
  {
    id: "session-2",
    title: "Swap 1 ETH for USDC",
    messages: [
      {
        id: "msg-5",
        role: "user",
        content: "Swap 1 ETH for USDC",
        timestamp: new Date("2024-10-31T14:20:00"),
      },
      {
        id: "msg-6",
        role: "assistant",
        content:
          "I can help you swap 1 ETH for USDC. Let me check the current exchange rates and find the best route for this swap.",
        timestamp: new Date("2024-10-31T14:20:05"),
      },
      {
        id: "msg-7",
        role: "assistant",
        content:
          "Current rate: 1 ETH ≈ 2,450 USDC. The swap will be executed through Uniswap with minimal slippage. Ready to proceed?",
        timestamp: new Date("2024-10-31T14:20:10"),
      },
      {
        id: "msg-8",
        role: "user",
        content: "Go ahead",
        timestamp: new Date("2024-10-31T14:20:20"),
      },
      {
        id: "msg-9",
        role: "assistant",
        content:
          "Swap completed successfully! You now have 2,450 USDC in your wallet. The transaction hash is 0x1234...5678.",
        timestamp: new Date("2024-10-31T14:20:30"),
      },
    ],
  },
  {
    id: "session-3",
    title: "What's my USDT balance?",
    messages: [
      {
        id: "msg-10",
        role: "user",
        content: "What's my USDT balance?",
        timestamp: new Date("2024-10-30T09:15:00"),
      },
      {
        id: "msg-11",
        role: "assistant",
        content:
          "Your current USDT balance is 325.75 USDT on Ethereum network. This is equivalent to approximately $325.75 USD.",
        timestamp: new Date("2024-10-30T09:15:05"),
      },
    ],
  },
  {
    id: "session-4",
    title: "Show my recent transactions",
    messages: [
      {
        id: "msg-12",
        role: "user",
        content: "Show my recent transactions",
        timestamp: new Date("2024-10-29T16:45:00"),
      },
      {
        id: "msg-13",
        role: "assistant",
        content:
          "Here are your recent transactions:\n\n1. Sent 20 USDT to Andre - 2 hours ago\n2. Swapped 1 ETH for 2,450 USDC - 1 day ago\n3. Received 0.5 ETH from Bob - 3 days ago\n4. Staked 100 MATIC - 5 days ago",
        timestamp: new Date("2024-10-29T16:45:05"),
      },
    ],
  },
  {
    id: "session-5",
    title: "How do I stake my tokens?",
    messages: [
      {
        id: "msg-14",
        role: "user",
        content: "How do I stake my tokens?",
        timestamp: new Date("2024-10-28T11:30:00"),
      },
      {
        id: "msg-15",
        role: "assistant",
        content:
          "To stake your tokens, you can use various DeFi protocols. For Ethereum, you can stake ETH through Lido or Rocket Pool. For other tokens, you can use Aave or Compound.",
        timestamp: new Date("2024-10-28T11:30:05"),
      },
      {
        id: "msg-16",
        role: "user",
        content: "What's the current APY for staking ETH?",
        timestamp: new Date("2024-10-28T11:30:15"),
      },
      {
        id: "msg-17",
        role: "assistant",
        content:
          "The current APY for staking ETH is approximately 3.2% on Lido and 3.5% on Rocket Pool. These rates fluctuate based on network conditions.",
        timestamp: new Date("2024-10-28T11:30:20"),
      },
    ],
  },
  {
    id: "session-6",
    title: "Transfer 50 USDC to Alice",
    messages: [
      {
        id: "msg-18",
        role: "user",
        content: "Transfer 50 USDC to Alice",
        timestamp: new Date("2024-10-27T13:15:00"),
      },
      {
        id: "msg-19",
        role: "assistant",
        content:
          "I'll help you transfer 50 USDC to Alice at 0x8ba1f109551bD432803012645Ac136ddd64DBA72.",
        timestamp: new Date("2024-10-27T13:15:05"),
      },
      {
        id: "msg-20",
        role: "user",
        content: "Confirm the transfer",
        timestamp: new Date("2024-10-27T13:15:15"),
      },
      {
        id: "msg-21",
        role: "assistant",
        content: "Transfer of 50 USDC to Alice completed successfully!",
        timestamp: new Date("2024-10-27T13:15:20"),
      },
    ],
  },
  {
    id: "session-7",
    title: "Swap 2 BTC for ETH",
    messages: [
      {
        id: "msg-22",
        role: "user",
        content: "Swap 2 BTC for ETH",
        timestamp: new Date("2024-10-26T08:45:00"),
      },
      {
        id: "msg-23",
        role: "assistant",
        content:
          "Current rate: 2 BTC ≈ 32 ETH. Proceeding with the swap through Uniswap.",
        timestamp: new Date("2024-10-26T08:45:05"),
      },
      {
        id: "msg-24",
        role: "assistant",
        content: "Swap completed! You now have 32 ETH in your wallet.",
        timestamp: new Date("2024-10-26T08:45:15"),
      },
    ],
  },
  {
    id: "session-8",
    title: "What's my portfolio value?",
    messages: [
      {
        id: "msg-25",
        role: "user",
        content: "What's my portfolio value?",
        timestamp: new Date("2024-10-25T15:30:00"),
      },
      {
        id: "msg-26",
        role: "assistant",
        content:
          "Your total portfolio value is approximately $125,450 USD. This includes all your crypto assets across different chains.",
        timestamp: new Date("2024-10-25T15:30:05"),
      },
    ],
  },
  {
    id: "session-9",
    title: "Send 100 MATIC to Bob",
    messages: [
      {
        id: "msg-27",
        role: "user",
        content: "Send 100 MATIC to Bob",
        timestamp: new Date("2024-10-24T12:00:00"),
      },
      {
        id: "msg-28",
        role: "assistant",
        content:
          "I'll send 100 MATIC to Bob's address. Preparing the transaction...",
        timestamp: new Date("2024-10-24T12:00:05"),
      },
      {
        id: "msg-29",
        role: "assistant",
        content: "Transaction sent! 100 MATIC is on its way to Bob.",
        timestamp: new Date("2024-10-24T12:00:15"),
      },
    ],
  },
  {
    id: "session-10",
    title: "How to bridge tokens?",
    messages: [
      {
        id: "msg-30",
        role: "user",
        content: "How to bridge tokens between chains?",
        timestamp: new Date("2024-10-23T10:20:00"),
      },
      {
        id: "msg-31",
        role: "assistant",
        content:
          "You can bridge tokens using services like Stargate, Across, or Hop Protocol. Which tokens would you like to bridge?",
        timestamp: new Date("2024-10-23T10:20:05"),
      },
    ],
  },
  {
    id: "session-11",
    title: "Swap 5 USDT for DAI",
    messages: [
      {
        id: "msg-32",
        role: "user",
        content: "Swap 5 USDT for DAI",
        timestamp: new Date("2024-10-22T14:45:00"),
      },
      {
        id: "msg-33",
        role: "assistant",
        content: "Swapping 5 USDT for DAI at current market rate...",
        timestamp: new Date("2024-10-22T14:45:05"),
      },
      {
        id: "msg-34",
        role: "assistant",
        content: "Swap completed! You now have 5 DAI in your wallet.",
        timestamp: new Date("2024-10-22T14:45:15"),
      },
    ],
  },
  {
    id: "session-12",
    title: "Check gas fees",
    messages: [
      {
        id: "msg-35",
        role: "user",
        content: "What are the current gas fees?",
        timestamp: new Date("2024-10-21T09:30:00"),
      },
      {
        id: "msg-36",
        role: "assistant",
        content:
          "Current gas fees on Ethereum: Standard: 45 Gwei, Fast: 50 Gwei, Instant: 55 Gwei",
        timestamp: new Date("2024-10-21T09:30:05"),
      },
    ],
  },
  {
    id: "session-13",
    title: "Transfer 15 ETH to Andre",
    messages: [
      {
        id: "msg-37",
        role: "user",
        content: "Transfer 15 ETH to Andre",
        timestamp: new Date("2024-10-20T11:15:00"),
      },
      {
        id: "msg-38",
        role: "assistant",
        content: "Preparing to transfer 15 ETH to Andre's wallet...",
        timestamp: new Date("2024-10-20T11:15:05"),
      },
      {
        id: "msg-39",
        role: "assistant",
        content: "Transfer initiated! 15 ETH is being sent to Andre.",
        timestamp: new Date("2024-10-20T11:15:15"),
      },
    ],
  },
  {
    id: "session-14",
    title: "Yield farming opportunities",
    messages: [
      {
        id: "msg-40",
        role: "user",
        content: "What are the best yield farming opportunities?",
        timestamp: new Date("2024-10-19T16:00:00"),
      },
      {
        id: "msg-41",
        role: "assistant",
        content:
          "Top yield farming opportunities: Aave (8-12% APY), Curve (15-20% APY), Convex (20-25% APY)",
        timestamp: new Date("2024-10-19T16:00:05"),
      },
    ],
  },
  {
    id: "session-15",
    title: "Swap 3 MATIC for USDC",
    messages: [
      {
        id: "msg-42",
        role: "user",
        content: "Swap 3 MATIC for USDC",
        timestamp: new Date("2024-10-18T13:45:00"),
      },
      {
        id: "msg-43",
        role: "assistant",
        content: "Swapping 3 MATIC for USDC at current rate...",
        timestamp: new Date("2024-10-18T13:45:05"),
      },
      {
        id: "msg-44",
        role: "assistant",
        content: "Swap completed! You now have approximately 3.50 USDC.",
        timestamp: new Date("2024-10-18T13:45:15"),
      },
    ],
  },
];

/**
 * Get dummy chat sessions
 * @returns Array of dummy chat sessions
 */
export const getDummyChatSessions = (): ChatSession[] => {
  return DUMMY_CHAT_SESSIONS;
};

/**
 * Get a specific dummy chat session by ID
 * @param sessionId - The ID of the session to retrieve
 * @returns The chat session or undefined if not found
 */
export const getDummyChatSessionById = (
  sessionId: string,
): ChatSession | undefined => {
  return DUMMY_CHAT_SESSIONS.find((session) => session.id === sessionId);
};
