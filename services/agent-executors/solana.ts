/**
 * Solana-native mobile tool executors.
 *
 * Kept in a dedicated file so EVM executors stay untouched — parallel
 * surfaces rather than retrofitting viem-shaped tools with chain
 * dispatch. Each executor routes through `SolanaWalletKit` via the
 * `walletKitRegistry` so shared code stays chain-agnostic per the
 * space-docking rule (§4.5).
 *
 * Tools implemented here:
 *   - get_wallet_sol_balance  — connected wallet's SOL balance
 *   - get_sol_balance         — arbitrary Solana address balance
 *   - send_sol                — native SOL transfer
 *
 * The agent selects between these and the EVM siblings by reading
 * `wallet_context.namespace` — the tool descriptions on the server
 * spell this out (see `agent-api/src/tools/registry.ts`).
 */

import { tokenApi } from "@/api/endpoints/tokens";
import type { TToken } from "@/api/types/token";
import type { ChainConfig } from "@/constants/configs/chainConfig";
import { storage } from "@/lib/storage/mmkv";
import { walletKitRegistry } from "@/services/walletKit/registry";
import { formatUnits, parseUnits } from "viem";
import {
  ExecutorError,
  ExecutorErrorCode,
  type MobileToolExecutor,
  optionalString,
  requireString,
  safeExecute,
} from "./types";

const SOLANA_NAMESPACE = "solana" as const;

/**
 * Pull the currently-active chain from the same MMKV slot that
 * `useWallet` writes to. Executors can't read the React Query cache
 * directly, so we deserialize the persisted `ChainConfig` here.
 *
 * Narrow to Solana with a predictable error so callers that fire
 * while the active chain is EVM fail fast instead of crashing inside
 * the kit.
 */
function getActiveSolanaChain(): Extract<ChainConfig, { namespace: "solana" }> {
  const raw = storage.getString("active_chain");
  if (!raw) {
    throw new ExecutorError(
      ExecutorErrorCode.UnsupportedChain,
      "no_active_chain",
    );
  }
  const parsed = JSON.parse(raw) as ChainConfig;
  if (parsed.namespace !== SOLANA_NAMESPACE) {
    throw new ExecutorError(
      ExecutorErrorCode.UnsupportedChain,
      "active_chain_is_not_solana",
    );
  }
  return parsed;
}

function getSolanaKit() {
  if (!walletKitRegistry.has(SOLANA_NAMESPACE)) {
    throw new ExecutorError(
      ExecutorErrorCode.NotImplemented,
      "solana_kit_not_registered",
    );
  }
  return walletKitRegistry.get(SOLANA_NAMESPACE);
}

function requireSolanaAddress(value: string, key: string): string {
  const kit = getSolanaKit();
  if (!kit.validateAddress(value)) {
    throw new ExecutorError(ExecutorErrorCode.InvalidInput, `invalid_${key}`);
  }
  return value;
}

/**
 * `get_wallet_sol_balance` — connected wallet's SOL balance on the
 * active Solana cluster. Returns raw lamports alongside a pre-
 * formatted human string so the LLM never has to divide by 1e9.
 */
export const getWalletSolBalance: MobileToolExecutor = (_input, context) =>
  safeExecute(async () => {
    const address = context.wallet?.address;
    if (!address) {
      throw new ExecutorError(
        ExecutorErrorCode.WalletCannotExecute,
        "no connected wallet",
      );
    }
    if (context.wallet.namespace !== SOLANA_NAMESPACE) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "wallet_not_solana",
      );
    }
    const chain = getActiveSolanaChain();
    const kit = getSolanaKit();
    const lamports = await kit.getNativeBalance(address, chain);
    return {
      status: "success",
      data: {
        address,
        cluster: chain.cluster,
        balance_lamports: lamports.toString(),
        balance_display: kit.formatNativeAmount(lamports, chain),
        symbol: "SOL",
      },
    };
  });

/**
 * `get_sol_balance` — SOL balance for an arbitrary address. Falls
 * back to the connected wallet when the agent omits `address`,
 * mirroring the EVM `get_balance` ergonomics.
 */
export const getSolBalance: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    const kit = getSolanaKit();
    const chain = getActiveSolanaChain();

    const explicit = optionalString(input, "address");
    const address = explicit ?? context.wallet?.address;
    if (!address) {
      throw new ExecutorError(
        ExecutorErrorCode.InvalidInput,
        "missing_or_invalid_address",
      );
    }
    requireSolanaAddress(address, "address");

    const lamports = await kit.getNativeBalance(address, chain);
    return {
      status: "success",
      data: {
        address,
        cluster: chain.cluster,
        balance_lamports: lamports.toString(),
        balance_display: kit.formatNativeAmount(lamports, chain),
        symbol: "SOL",
      },
    };
  });

/**
 * `send_sol` — native SOL transfer from the connected wallet. The
 * dispatcher gates on the approval sheet (`capability: "write"`)
 * before this runs, so by the time we're called the user has
 * confirmed. Returns the tx signature as `tx_hash` for symmetry with
 * EVM writes — the protocol field is chain-agnostic even though its
 * type hint is `0x${string}` on EVM.
 */
export const sendSol: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    if (!context.wallet?.address) {
      throw new ExecutorError(
        ExecutorErrorCode.WalletCannotExecute,
        "no connected wallet",
      );
    }
    if (context.wallet.namespace !== SOLANA_NAMESPACE) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "wallet_not_solana",
      );
    }

    const to = requireString(input, "to");
    requireSolanaAddress(to, "to");

    const amountHuman = requireString(input, "amount_sol");
    const amountFloat = parseFloat(amountHuman);
    if (!Number.isFinite(amountFloat) || amountFloat <= 0) {
      throw new ExecutorError(
        ExecutorErrorCode.InvalidInput,
        "invalid_amount_sol",
      );
    }

    const kit = getSolanaKit();
    const chain = getActiveSolanaChain();
    const lamports = kit.parseNativeAmount(amountHuman, chain);
    const signature = await kit.sendNativeTransfer({
      wallet: context.wallet,
      to,
      amount: lamports,
      chain,
    });

    // NOTE: `tx_hash` is typed `0x${string}` and the server's
    // `toolResultPayloadSchema` validates it against a hex regex, so we
    // deliberately do NOT put the Solana base58 signature there. It
    // lives on `data.signature` instead — the pendingTxCard can branch
    // on tool name (`send_sol`) to render/link it correctly.
    return {
      status: "success",
      tx_confirmed: true,
      data: {
        signature,
        to,
        cluster: chain.cluster,
        amount_lamports: lamports.toString(),
        amount_sol: amountHuman,
      },
    };
  });

/**
 * `get_wallet_spl_tokens` — list SPL tokens for the active Solana cluster.
 * Solana counterpart to the EVM `get_wallet_tokens`. Loads the cached token
 * list (same MMKV cache), filters by the Solana blockchain's id, and
 * optionally resolves live on-chain balances via `kit.getTokenBalance`.
 * Native SOL is prepended as a pseudo-row (is_native: true) unless excluded.
 */
export const getSolanaWalletTokens: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    const kit = getSolanaKit();
    const chain = getActiveSolanaChain();

    const walletAddress = context.wallet?.address;
    if (!walletAddress) {
      throw new ExecutorError(
        ExecutorErrorCode.WalletCannotExecute,
        "no connected wallet",
      );
    }
    if (context.wallet.namespace !== SOLANA_NAMESPACE) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "wallet_not_solana",
      );
    }

    // Match the Solana blockchain row the same way BalanceSection does:
    // filter by !isEVM AND isTestnet matching the active cluster so devnet
    // wallets don't accidentally query mainnet token mints (which would
    // cause getTokenBalance to return 0 for every token).
    const isTestnet = chain.cluster !== "mainnet-beta";
    const solanaBlockchain = context.blockchains.find(
      (b) => !b.isEVM && b.isActive && b.isTestnet === isTestnet,
    );
    if (!solanaBlockchain) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "solana_blockchain_not_found_in_registry",
      );
    }

    // Load SPL tokens for this blockchain using the same search path the
    // send screen uses — tokenApi.searchTokens({ blockchainId }) — with a
    // per-blockchain MMKV cache so repeated calls within 5 minutes are free.
    const SPL_CACHE_KEY = `cached_spl_tokens_${solanaBlockchain.id}`;
    const SPL_CACHE_TS_KEY = `cached_spl_tokens_ts_${solanaBlockchain.id}`;
    const SPL_STALE_MS = 5 * 60 * 1000;

    let allTokens: TToken[];
    try {
      const cachedRaw = storage.getString(SPL_CACHE_KEY);
      const tsRaw = storage.getString(SPL_CACHE_TS_KEY);
      const ts = tsRaw ? parseInt(tsRaw, 10) : 0;
      if (cachedRaw && Date.now() - ts < SPL_STALE_MS) {
        const parsed = JSON.parse(cachedRaw);
        allTokens = Array.isArray(parsed) ? (parsed as TToken[]) : [];
      } else {
        allTokens = await tokenApi.searchTokens({
          blockchainId: solanaBlockchain.id,
          isActive: true,
        });
        storage.set(SPL_CACHE_KEY, JSON.stringify(allTokens));
        storage.set(SPL_CACHE_TS_KEY, Date.now().toString());
      }
    } catch (err) {
      // Offline fallback: serve stale cache if available.
      const cachedRaw = storage.getString(SPL_CACHE_KEY);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          allTokens = Array.isArray(parsed) ? (parsed as TToken[]) : [];
        } catch {
          throw new ExecutorError(
            ExecutorErrorCode.NetworkError,
            `failed to fetch SPL token list: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        throw new ExecutorError(
          ExecutorErrorCode.NetworkError,
          `failed to fetch SPL token list: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const symFilter =
      typeof input.symbol === "string" && input.symbol.length > 0
        ? input.symbol.toLowerCase()
        : null;

    const splTokens = allTokens.filter((t) => {
      if (t.isActive === false) return false;
      if (t.isNativeCurrency) return false; // native handled separately
      if (
        typeof input.is_stable_coin === "boolean" &&
        t.isStablecoin !== input.is_stable_coin
      ) {
        return false;
      }
      if (symFilter) {
        const s = t.symbol.toLowerCase();
        if (s !== symFilter && !s.startsWith(symFilter)) return false;
      }
      return true;
    });

    const includeNative = input.is_native_currency !== false;
    const includeBalance = input.include_balance === true;

    // Resolve live SOL balance if needed.
    let solLamports: bigint | undefined;
    if (includeBalance) {
      try {
        solLamports = await kit.getNativeBalance(walletAddress, chain);
      } catch {
        // balance unavailable — omit fields but keep going
      }
    }

    // Build the token rows with optional live SPL balances.
    const splRows = await Promise.all(
      splTokens.map(async (t) => {
        let balance_display: string | undefined;
        let balance_lamports: string | undefined;

        if (includeBalance && t.contractAddress) {
          try {
            const raw = await kit.getTokenBalance(
              walletAddress,
              chain,
              t.contractAddress,
            );
            balance_lamports = raw.toString();
            balance_display = formatUnits(raw, t.decimals);
          } catch {
            // per-token failure — omit balance fields
          }
        }

        return {
          symbol: t.symbol,
          name: t.name,
          address: t.contractAddress ?? "",
          decimals: t.decimals,
          is_native: false,
          is_stable_coin: t.isStablecoin ?? false,
          ...(t.logoUrl ? { logo_url: t.logoUrl } : {}),
          ...(t.peggedCurrency ? { pegged_currency: t.peggedCurrency } : {}),
          ...(balance_lamports !== undefined ? { balance_lamports } : {}),
          ...(balance_display !== undefined ? { balance_display } : {}),
        };
      }),
    );

    // Prepend native SOL row.
    const nativeSymbol = "SOL";
    const nativePasses =
      !symFilter ||
      nativeSymbol.toLowerCase() === symFilter ||
      nativeSymbol.toLowerCase().startsWith(symFilter);
    const stablePasses = input.is_stable_coin !== true;

    const nativeRow =
      includeNative && nativePasses && stablePasses
        ? {
            symbol: "SOL",
            name: "Solana",
            address: "",
            decimals: 9,
            is_native: true,
            is_stable_coin: false,
            ...(solLamports !== undefined
              ? {
                  balance_lamports: solLamports.toString(),
                  balance_display: formatUnits(solLamports, 9),
                }
              : {}),
          }
        : null;

    const tokens = nativeRow ? [nativeRow, ...splRows] : splRows;

    // Compact agent-facing slice (no logo_url to save context).
    const agentSlice = tokens.map((t) => ({
      symbol: t.symbol,
      address: t.address,
      decimals: t.decimals,
      is_native: t.is_native,
      ...(t.balance_display !== undefined
        ? { balance_display: t.balance_display }
        : {}),
    }));

    return {
      status: "success",
      data: {
        cluster: chain.cluster,
        tokens: agentSlice,
      },
      display: {
        cluster: chain.cluster,
        tokens,
      },
    };
  });

/**
 * `send_spl_token` — SPL token transfer (classic Token Program and
 * Token-2022) from the connected wallet. The kit's `sendTokenTransfer`
 * auto-detects the token program via the mint's on-chain account owner,
 * so no discriminator is needed here. Mirrors the `kit.sendTokenTransfer`
 * path in `app/send.tsx` for token transfers on Solana.
 */
export const sendSplToken: MobileToolExecutor = (input, context) =>
  safeExecute(async () => {
    if (!context.wallet?.address) {
      throw new ExecutorError(
        ExecutorErrorCode.WalletCannotExecute,
        "no connected wallet",
      );
    }
    if (context.wallet.namespace !== SOLANA_NAMESPACE) {
      throw new ExecutorError(
        ExecutorErrorCode.UnsupportedChain,
        "wallet_not_solana",
      );
    }

    const to = requireString(input, "to");
    requireSolanaAddress(to, "to");

    const mintAddress = requireString(input, "mint_address");
    requireSolanaAddress(mintAddress, "mint_address");

    const tokenAmountHuman = requireString(input, "token_amount");

    const rawDecimals = input.token_decimals;
    const decimals =
      typeof rawDecimals === "number"
        ? rawDecimals
        : parseInt(String(rawDecimals), 10);
    if (!Number.isInteger(decimals) || decimals < 0) {
      throw new ExecutorError(
        ExecutorErrorCode.InvalidInput,
        "invalid_token_decimals",
      );
    }

    let amountRaw: bigint;
    try {
      amountRaw = parseUnits(tokenAmountHuman, decimals);
    } catch {
      throw new ExecutorError(
        ExecutorErrorCode.InvalidInput,
        "invalid_token_amount",
      );
    }
    if (amountRaw <= 0n) {
      throw new ExecutorError(
        ExecutorErrorCode.InvalidInput,
        "token_amount_must_be_positive",
      );
    }

    const kit = getSolanaKit();
    const chain = getActiveSolanaChain();
    const signature = await kit.sendTokenTransfer({
      wallet: context.wallet,
      to,
      amount: amountRaw,
      chain,
      contractAddress: mintAddress,
      decimals,
    });

    return {
      status: "success",
      tx_confirmed: true,
      data: {
        signature,
        to,
        mint_address: mintAddress,
        cluster: chain.cluster,
        amount_raw: amountRaw.toString(),
        token_amount: tokenAmountHuman,
        decimals,
      },
    };
  });

export const SOLANA_EXECUTORS: Record<string, MobileToolExecutor> = {
  get_wallet_sol_balance: getWalletSolBalance,
  get_sol_balance: getSolBalance,
  send_sol: sendSol,
  get_wallet_spl_tokens: getSolanaWalletTokens,
  send_spl_token: sendSplToken,
};
