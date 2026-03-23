const AbiTakumiPointDeposit = [
  {
    inputs: [
      { internalType: "address", name: "tokenAddress", type: "address" },
      { internalType: "string", name: "refId", type: "string" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "depositPoints",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
    ],
    name: "isAllowedPointToken",
    outputs: [
      { internalType: "bool", name: "", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "depositId", type: "uint256" },
      { indexed: true, internalType: "address", name: "walletAddress", type: "address" },
      { indexed: true, internalType: "address", name: "tokenAddress", type: "address" },
      { indexed: false, internalType: "string", name: "refId", type: "string" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    name: "PointDepositCreated",
    type: "event",
  },
] as const;

export default AbiTakumiPointDeposit;
