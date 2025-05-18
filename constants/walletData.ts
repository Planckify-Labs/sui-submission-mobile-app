// Define wallet type
export interface TWallet {
  name: string;
  address: string;
  privateKey: string;
  seedPhrase?: string; // Optional - some wallets might only have private key
  balance: string;
  source: "Created" | "Imported" | "Social"; // Source of the wallet
  type: "PrivateKey" | "SeedPhrase" | "Social"; // Type of wallet
  socialAccount?: {
    provider: string;
    email: string;
    name: string;
  };
}

// Mock wallet data for development and testing
export const mockWallets: TWallet[] = [
  {
    name: "Main Wallet",
    address: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
    privateKey: "0x1234...5678", // Abbreviated for security
    seedPhrase:
      "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12",
    balance: "1.245 ETH",
    source: "Created",
    type: "SeedPhrase",
  },
  {
    name: "Imported Wallet",
    address: "0x3Dc6EC5fF357EB292A9089F1BC13559C9C93B33E",
    privateKey: "0xabcd...efgh",
    balance: "0.5 ETH",
    source: "Imported",
    type: "PrivateKey",
  },
  {
    name: "Social Wallet",
    address: "0x8901C7BEe5A847d9B3935a5CD0B3985F8248E6C2",
    privateKey: "0xijkl...mnop", // This would be encrypted with the user's social credentials
    balance: "0.1 ETH",
    source: "Social",
    type: "Social",
    socialAccount: {
      provider: "Google",
      email: "user@gmail.com",
      name: "User Name",
    },
  },
];
