export * from "./types";
export * from "./pda";
export * from "./errors";
export * from "./refIdHash";
export { TAKUMI_PAY_IDL } from "./idl";

import { PublicKey, SystemProgram } from "@solana/web3.js";

export function isNativeSol(tokenMint: PublicKey): boolean {
  return tokenMint.equals(SystemProgram.programId);
}
