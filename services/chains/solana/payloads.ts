export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet";

export type SolanaConnectPayload = { cluster: SolanaCluster };
export type SolanaSignMessagePayload = { message: string; address: string };
export type SolanaSignTxPayload = {
  transaction: string; // base64-encoded serialized tx
  cluster: SolanaCluster;
  address: string;
};
