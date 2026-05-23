/**
 * Jito SOL adapter — SPL Stake Pool DepositSol + WithdrawSol.
 *
 * Spec: docs/defi-strategies-spec.md Appendix B.5.
 *
 * Coordinates from `JITO.*` constants (doc-sourced from jito.network).
 * Instructions are hand-rolled against the SPL Stake Pool program
 * layout (instructions 14 = DepositSol, 16 = WithdrawSol). This avoids
 * a new `@solana/spl-stake-pool` dependency while still producing
 * fully-real instructions that submit to the live program.
 *
 * Pool-state fields (reserve_stake, manager_fee_account) are read on
 * demand from the StakePool account because they're chain state, not
 * documentable constants.
 */

import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { JITO } from "../constants/addresses";
import { DefiError } from "../errors/defiErrors";
import type { DefiPosition, DefiProtocolAdapter, UnsignedCall } from "../types";

// SPL Stake Pool program coordinates.
const SPL_STAKE_POOL_PROGRAM = new PublicKey(JITO.splStakePoolProgram);
const JITO_STAKE_POOL = new PublicKey(JITO.stakePool);
const JITO_SOL_MINT = new PublicKey(JITO.jitoSolMint);

// Native Solana stake-program ID. (Hardcoded; not exported by web3.js.)
const STAKE_PROGRAM_ID = new PublicKey(
  "Stake11111111111111111111111111111111111111",
);

// Instruction discriminators per SPL Stake Pool program.
// https://github.com/solana-program/stake-pool
const IX_DEPOSIT_SOL = 14;
const IX_WITHDRAW_SOL = 16;

// Offsets within the StakePool account layout that we need.
//   0:   account_type (u8)
//   1:   manager (32)
//   33:  staker (32)
//   65:  stake_deposit_authority (32)
//   97:  stake_withdraw_bump_seed (u8)
//   98:  validator_list (32)
//   130: reserve_stake (32)
//   162: pool_mint (32)
//   194: manager_fee_account (32)
//   226: token_program_id (32)
//   258: total_lamports (u64)         — SOL backing the pool
//   266: pool_token_supply (u64)      — total jitoSOL minted
// https://github.com/solana-program/stake-pool/blob/main/program/src/state.rs
const RESERVE_STAKE_OFFSET = 130;
const MANAGER_FEE_OFFSET = 194;
const TOTAL_LAMPORTS_OFFSET = 258;
const POOL_TOKEN_SUPPLY_OFFSET = 266;

function deriveWithdrawAuthority(stakePool: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [stakePool.toBuffer(), Buffer.from("withdraw")],
    SPL_STAKE_POOL_PROGRAM,
  );
  return pda;
}

interface PoolState {
  reserveStake: PublicKey;
  managerFeeAccount: PublicKey;
}

async function readPoolState(connection: Connection): Promise<PoolState> {
  const accountInfo = await connection.getAccountInfo(JITO_STAKE_POOL);
  if (!accountInfo) {
    throw new DefiError("network_error", "jito: stake pool account not found");
  }
  const data = accountInfo.data;
  if (data.length < MANAGER_FEE_OFFSET + 32) {
    throw new DefiError("network_error", "jito: stake pool account too small");
  }
  return {
    reserveStake: new PublicKey(
      data.subarray(RESERVE_STAKE_OFFSET, RESERVE_STAKE_OFFSET + 32),
    ),
    managerFeeAccount: new PublicKey(
      data.subarray(MANAGER_FEE_OFFSET, MANAGER_FEE_OFFSET + 32),
    ),
  };
}

function encodeU64LE(value: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(value, 0);
  return b;
}

function buildDepositSolData(lamports: bigint): Buffer {
  // discriminator (u8) + lamports (u64 LE)
  const b = Buffer.alloc(9);
  b.writeUInt8(IX_DEPOSIT_SOL, 0);
  encodeU64LE(lamports).copy(b, 1);
  return b;
}

function buildWithdrawSolData(poolTokens: bigint): Buffer {
  const b = Buffer.alloc(9);
  b.writeUInt8(IX_WITHDRAW_SOL, 0);
  encodeU64LE(poolTokens).copy(b, 1);
  return b;
}

function makeConnection(rpcUrl: string | undefined): Connection {
  return new Connection(
    rpcUrl || "https://api.mainnet-beta.solana.com",
    "confirmed",
  );
}

export const SolanaJitoAdapter: DefiProtocolAdapter = {
  slug: "jito-solana",
  namespace: "solana",
  kind: "liquid_staking",
  chainId: "mainnet-beta",
  displayName: "Jito (Solana)",
  staticSafetyScore: 84,
  // Per Jito docs: minimum deposit is 0.01 SOL (10_000_000 lamports).
  minDepositRaw: 10_000_000n,

  async buildDeposit({ wallet, chain, amount }) {
    if (chain.namespace !== "solana") {
      throw new DefiError(
        "unsupported_chain",
        "jito: requires solana namespace",
      );
    }
    const connection = makeConnection(chain.rpcUrl);
    const poolState = await readPoolState(connection);
    const fromPubkey = new PublicKey(wallet.address);
    const withdrawAuthority = deriveWithdrawAuthority(JITO_STAKE_POOL);
    const destPoolAccount = getAssociatedTokenAddressSync(
      JITO_SOL_MINT,
      fromPubkey,
    );

    // Idempotent ATA create (no-op if it already exists). Saves the
    // user a separate "create ATA" first deposit.
    const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      fromPubkey, // payer
      destPoolAccount,
      fromPubkey, // owner
      JITO_SOL_MINT,
    );

    const depositIx = new TransactionInstruction({
      programId: SPL_STAKE_POOL_PROGRAM,
      keys: [
        { pubkey: JITO_STAKE_POOL, isSigner: false, isWritable: true },
        { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
        { pubkey: poolState.reserveStake, isSigner: false, isWritable: true },
        { pubkey: fromPubkey, isSigner: true, isWritable: true },
        { pubkey: destPoolAccount, isSigner: false, isWritable: true },
        {
          pubkey: poolState.managerFeeAccount,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: poolState.managerFeeAccount,
          isSigner: false,
          isWritable: true,
        }, // referrer (none)
        { pubkey: JITO_SOL_MINT, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: buildDepositSolData(amount),
    });

    return {
      kind: "solana-ix",
      instructions: [createAtaIx, depositIx],
    } satisfies UnsignedCall;
  },

  async buildWithdraw({ wallet, chain, amount }) {
    if (chain.namespace !== "solana") {
      throw new DefiError(
        "unsupported_chain",
        "jito: requires solana namespace",
      );
    }
    const connection = makeConnection(chain.rpcUrl);
    const poolState = await readPoolState(connection);
    const fromPubkey = new PublicKey(wallet.address);
    const sourcePoolAccount = getAssociatedTokenAddressSync(
      JITO_SOL_MINT,
      fromPubkey,
    );

    let poolTokens: bigint;
    if (amount === "MAX") {
      const accountInfo =
        await connection.getTokenAccountBalance(sourcePoolAccount);
      poolTokens = BigInt(accountInfo.value.amount);
      if (poolTokens === 0n)
        throw new DefiError("position_not_found", "jito: no jitoSOL balance");
    } else {
      poolTokens = amount;
    }

    const withdrawAuthority = deriveWithdrawAuthority(JITO_STAKE_POOL);
    const withdrawIx = new TransactionInstruction({
      programId: SPL_STAKE_POOL_PROGRAM,
      keys: [
        { pubkey: JITO_STAKE_POOL, isSigner: false, isWritable: true },
        { pubkey: withdrawAuthority, isSigner: false, isWritable: false },
        { pubkey: fromPubkey, isSigner: true, isWritable: false }, // user transfer authority
        { pubkey: sourcePoolAccount, isSigner: false, isWritable: true },
        { pubkey: poolState.reserveStake, isSigner: false, isWritable: true },
        { pubkey: fromPubkey, isSigner: false, isWritable: true }, // lamports destination
        {
          pubkey: poolState.managerFeeAccount,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: JITO_SOL_MINT, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        {
          pubkey: SYSVAR_STAKE_HISTORY_PUBKEY,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: STAKE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: buildWithdrawSolData(poolTokens),
    });

    return {
      kind: "solana-ix",
      instructions: [withdrawIx],
    } satisfies UnsignedCall;
  },

  async readPosition(walletAddress: string): Promise<DefiPosition | null> {
    // Returns the position in SOL-equivalent lamports, not jitoSOL units.
    // jitoSOL appreciates against SOL via accrued staking rewards
    // (~1.05–1.10 SOL/jitoSOL today), so reporting the jitoSOL amount
    // verbatim underreports the user's stake. We multiply by the stake
    // pool's exchange rate (`total_lamports / pool_token_supply`) which
    // is the same conversion the program applies on `WithdrawSol`.
    try {
      const connection = makeConnection(undefined);
      const owner = new PublicKey(walletAddress);
      const ata = getAssociatedTokenAddressSync(JITO_SOL_MINT, owner);
      const [tokenBalance, poolAccount] = await Promise.all([
        connection.getTokenAccountBalance(ata).catch(() => null),
        connection.getAccountInfo(JITO_STAKE_POOL).catch(() => null),
      ]);
      if (!tokenBalance || tokenBalance.value.amount === "0") return null;
      const jitoSolAmount = BigInt(tokenBalance.value.amount);

      // Apply the exchange rate when we can read the pool. On a network
      // hiccup we fall back to the jitoSOL amount as a 1:1 estimate —
      // showing something close-but-conservative is better than blank.
      let solEquivalent = jitoSolAmount;
      if (
        poolAccount &&
        poolAccount.data.length >= POOL_TOKEN_SUPPLY_OFFSET + 8
      ) {
        const totalLamports = poolAccount.data.readBigUInt64LE(
          TOTAL_LAMPORTS_OFFSET,
        );
        const poolTokenSupply = poolAccount.data.readBigUInt64LE(
          POOL_TOKEN_SUPPLY_OFFSET,
        );
        if (poolTokenSupply > 0n && totalLamports > 0n) {
          solEquivalent = (jitoSolAmount * totalLamports) / poolTokenSupply;
        }
      }

      return {
        protocolSlug: "jito-solana",
        namespace: "solana",
        chainId: "mainnet-beta",
        assetSymbol: "SOL",
        amountAtDeposit: 0n,
        amountAtDepositUsd: 0,
        currentAmount: solEquivalent,
        currentAmountUsd: 0, // priced upstream
        pnlUsd: 0,
      };
    } catch {
      return null;
    }
  },
};
