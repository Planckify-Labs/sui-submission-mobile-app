/**
 * `/pay-merchant` — Path B (Circle Nanopayments, EIP-3009) scan-to-pay
 * screen. Ships the M2 happy path: quote fetch → sign → submit → poll.
 *
 * Spec: `docs/umkm-usdc-payout-spec.md` §2 steps 6–7 (scan → sign → settle),
 * §5.5 (happy-path wiring), §6.2 (`PaymentIntent`), §8.5 #1 (intent-id-first
 * deep-link contract), milestone M2.
 *
 * Three-role separation (memory `feedback_role_separation.md`, §9 FX-
 * manipulation rule): the server creates the intent and pre-shapes every
 * EIP-712 field the wallet will sign (domain, nonce, value). The wallet
 * only signs. This screen renders + dispatches — it NEVER computes FX,
 * mints nonces, or forwards an unsigned intent to Circle directly. The
 * user approves the IDR amount; `usdcAmountMicros` is a derived display.
 *
 * Chain-extension discipline (memory `feedback_chain_extension_discipline.md`):
 * the sign step dispatches via presence-of-method on `WalletKitAdapter.
 * signTransferWithAuthorization`. Solana's kit leaves that method
 * `undefined`; M6 task 42 adds the SVM equivalent. No
 * `if (namespace === "X")` here.
 *
 * Route params:
 *   - `intentId` (canonical) — existing server intent, we poll it.
 *   - `raw` + `kind` (M1 fallback) — scanner handed us the parsed QRIS
 *     bytes before the server mint endpoint shipped; we mint here and
 *     redirect to the canonical `?intentId=` URL.
 *
 * M2 residuals (noted inline):
 *   - Task 24 (settle proxy) backend — until it lands, the submit POST
 *     404s. We catch `NanopaySubmitError.status === 404` and show a
 *     dev-only banner so QA can tell "backend not ready" from "crash".
 *   - Task 27 (`GET /v1/merchants/:id`) — not yet available; we fall
 *     back to "Merchant" for display name.
 *   - Task 31 (receipt screen) — landed. On the first `paid` status
 *     transition, we `router.replace` to `/pay-merchant/receipt?intentId
 *     =<id>` so the receipt becomes the back-stack target. The inline
 *     `PaidCard` below is now a *transient* loader covering the frame
 *     window between the status flip and Expo Router's navigation
 *     commit — keeps the user from seeing a flash of the quote card.
 *   - Task 44 (`<PaymentError>` component) — landed. This screen
 *     imports the shared component + classifier + copy table from
 *     `services/errors/paymentErrors.ts` and
 *     `components/PaymentError.tsx`. No inline error strings remain.
 */

import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, CheckCircle2, Store } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatUnits } from "viem";
import { PaymentError } from "@/components/PaymentError";
import { findEvmChainById } from "@/constants/configs/chainConfig";
import { api } from "@/constants/configs/ky";
import { useWallet } from "@/hooks/useWallet";
import {
  classifyPaymentError,
  type PaymentErrorCode,
} from "@/services/errors/paymentErrors";
import {
  buildAuthorizationFromIntent,
  type PaymentIntentResponse,
  useCreateIntent,
  useIntentStatus,
  useSubmitNanopay,
} from "@/services/nanopay";
import {
  executePathA,
  type OnChainReceiptRequest,
  type OnChainReceiptResponse,
  onChainReceiptEndpoint,
  postOnChainReceipt,
  watchArcPayoutEvent,
} from "@/services/nanopay/pathADirectArc";

/** Arc Testnet viem chainId — source chain for the Nanopay EIP-3009 sig. */
const ARC_TESTNET_CHAIN_ID = 5042002;

/** USDC is a 6-decimal ERC-20 (the `usdcAmountMicros` field is in micros). */
const USDC_DECIMALS = 6;

/** Merchant kinds we accept from the scanner fallback path. */
type MerchantKind = "qris" | "takumipay";

/**
 * Screen-local state machine. The intent's `status` field drives most of
 * the UI, but signing and the submit handshake happen client-side before
 * the server even knows — hence the extra local phases.
 */
type LocalPhase =
  | "idle" // quote visible, waiting on user tap
  | "signing" // wallet is producing the EIP-712 signature
  | "submitting" // POST /v1/pay/intents/:id/nanopay in flight
  | "settled" // local bookkeeping; truth is `intent.status === "paid"`
  | "error";

/**
 * Screen-local error shape. The `code` comes from the shared
 * `classifyPaymentError` helper (task 44); `devMessage` is kept only
 * for `__DEV__` surfacing inside `<PaymentError>`.
 */
interface LocalError {
  code: PaymentErrorCode;
  devMessage?: string;
}

/** ── helpers (inline per task constraint) ───────────────────────────── */

const formatIdrMinor = (minor: number): string => {
  const s = Math.max(0, Math.floor(minor)).toString();
  const groups: string[] = [];
  for (let i = s.length; i > 0; i -= 3) {
    groups.unshift(s.slice(Math.max(0, i - 3), i));
  }
  return `Rp ${groups.join(".")}`;
};

/**
 * Formats 6-decimal USDC atomic units for the derived secondary display.
 * Trims trailing zeros past 2dp for readability — we never render more
 * than 4dp since `usdcAmountMicros` from the backend is already at micro
 * precision and the user approved an IDR amount, not this number.
 */
const formatUsdcMicros = (micros: string): string => {
  try {
    const whole = formatUnits(BigInt(micros), USDC_DECIMALS);
    const n = parseFloat(whole);
    if (!Number.isFinite(n)) return `${whole} USDC`;
    return `${n.toFixed(n < 1 ? 4 : 2)} USDC`;
  } catch {
    return `${micros} µUSDC`;
  }
};

const resolveKind = (
  kindParam: string | undefined,
  providerParam: string | undefined,
): MerchantKind | null => {
  if (kindParam === "qris" || kindParam === "takumipay") return kindParam;
  if (providerParam === "xendit_qris") return "qris";
  if (providerParam === "takumipay") return "takumipay";
  return null;
};

/**
 * Screen-local wrapper around the shared classifier. Retains the raw
 * `err.message` in `devMessage` for `__DEV__` surfacing only (the
 * shared `classifyPaymentError` intentionally drops it so sensitive
 * hex blobs never make it to telemetry / prod logs).
 */
const classifyError = (err: unknown): LocalError => {
  const code = classifyPaymentError(err);
  const devMessage =
    err && typeof err === "object" && "message" in err
      ? typeof (err as { message?: unknown }).message === "string"
        ? ((err as { message?: string }).message as string)
        : undefined
      : typeof err === "string"
        ? err
        : undefined;
  return { code, devMessage };
};

/** ── screen ────────────────────────────────────────────────────────── */

export default function PayMerchant() {
  const params = useLocalSearchParams<{
    intentId?: string;
    channel?: string;
    kind?: string;
    provider?: string;
    raw?: string;
  }>();
  const intentId =
    typeof params.intentId === "string" ? params.intentId : undefined;
  const kindParam = typeof params.kind === "string" ? params.kind : undefined;
  const providerParam =
    typeof params.provider === "string" ? params.provider : undefined;
  const raw = typeof params.raw === "string" ? params.raw : undefined;
  const kind = resolveKind(kindParam, providerParam);

  const hasIntentId = Boolean(intentId && intentId.length > 0);
  const hasFallback = !hasIntentId && Boolean(kind) && Boolean(raw);

  return (
    <>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="dark-content"
      />
      <SafeAreaView className="flex-1 bg-light-main-container">
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => router.back()}
            className="mr-3 p-2 -ml-2"
            hitSlop={8}
          >
            <ArrowLeft color="#20222c" size={24} />
          </Pressable>
          <Text className="text-light-matte-black text-lg font-bold">
            Pay merchant
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {hasIntentId ? (
            <IntentFlow intentId={intentId as string} />
          ) : hasFallback ? (
            <MintFallback kind={kind as MerchantKind} raw={raw as string} />
          ) : (
            <MissingIntentCard />
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

/** ── intent-id path: poll, sign, submit ────────────────────────────── */

function IntentFlow({ intentId }: { intentId: string }) {
  const {
    activeWallet,
    activeChain,
    getActiveWalletKit,
    changeActiveChainToConfig,
  } = useWallet();
  const intentQ = useIntentStatus(intentId);
  const submit = useSubmitNanopay();

  const [phase, setPhase] = useState<LocalPhase>("idle");
  const [error, setError] = useState<LocalError | null>(null);

  const intent = intentQ.data;

  // Drive terminal phase from the server intent. Signing / submitting
  // flips first on our side, then the poll confirms.
  useEffect(() => {
    if (!intent) return;
    if (intent.status === "paid" || intent.status === "paid_out") {
      setPhase("settled");
      setError(null);
      return;
    }
    if (intent.status === "failed") {
      setPhase("error");
      setError({ code: "unknown", devMessage: "intent.status=failed" });
      return;
    }
    if (intent.status === "expired") {
      setPhase("error");
      setError({ code: "quote_expired" });
    }
  }, [intent]);

  // On the first `paid` transition, hand off to the dedicated receipt
  // screen (task 31). `router.replace` keeps the back stack clean: the
  // user's back button from the receipt returns to home/scanner, not
  // to this mid-flow screen. The `PaidCard` remains as a transient
  // loader covering the single render frame before navigation commits.
  useEffect(() => {
    if (!intent) return;
    if (intent.status !== "paid" && intent.status !== "paid_out") return;
    router.replace({
      // `/pay-merchant/receipt` isn't in the generated typed-routes
      // union yet — cast narrowly per the same pattern used for
      // `/pay-merchant` above.
      pathname: "/pay-merchant/receipt" as "/send",
      params: { intentId },
    });
  }, [intent, intentId]);

  // Quote-expiry guard from client clock — the backend enforces the real
  // cut-off, but this catches the "user left the app open for 2 mins"
  // case before we waste a wallet prompt.
  const isClientExpired = useMemo(() => {
    if (!intent?.expiresAt) return false;
    return intent.expiresAt < Date.now();
  }, [intent?.expiresAt]);

  const onPay = useCallback(async () => {
    if (!intent) return;

    // Presence-of-method dispatch — kits without EIP-3009 (Solana) leave
    // this undefined. No `if (namespace === "X")` branches.
    const kit = activeWallet?.namespace ? getActiveWalletKit() : null;
    if (!kit || typeof kit.signTransferWithAuthorization !== "function") {
      setError({ code: "wallet_unsupported" });
      setPhase("error");
      return;
    }

    // Pre-flight chain switch — the authorization is bound to
    // `intent.nanopay.sourceChainId`. If the active chain disagrees,
    // flip via the shared overlay so biometrics prompt against the
    // right network.
    const sourceChainId = intent.nanopay?.sourceChainId ?? ARC_TESTNET_CHAIN_ID;
    const sourceChainConfig = findEvmChainById(sourceChainId);
    if (!sourceChainConfig) {
      setError({
        code: "chain_mismatch",
        devMessage: `No chain config for id=${sourceChainId}`,
      });
      setPhase("error");
      return;
    }
    const activeEvmChainId =
      activeChain.namespace === "eip155" ? activeChain.chain.id : null;
    if (activeEvmChainId !== sourceChainId) {
      const ok = await changeActiveChainToConfig(sourceChainConfig);
      if (!ok) {
        setError({ code: "chain_mismatch" });
        setPhase("error");
        return;
      }
    }

    try {
      setPhase("signing");
      setError(null);

      const signArgs = buildAuthorizationFromIntent(intent, {
        wallet: activeWallet,
        chain: sourceChainConfig,
      });
      const signature = await kit.signTransferWithAuthorization(signArgs);

      setPhase("submitting");
      await submit.mutateAsync({ intentId, signature });
      // Polling picks up the terminal status; we stay in "submitting"
      // until `intent.status` flips to `paid | failed`.
    } catch (err) {
      // Defensive: do NOT log `signArgs`, `signature`, or bigint message
      // fields. `classifyError` only reads `name` / `message` / `status`.
      setError(classifyError(err));
      setPhase("error");
    }
  }, [
    activeChain,
    activeWallet,
    changeActiveChainToConfig,
    getActiveWalletKit,
    intent,
    intentId,
    submit,
  ]);

  // Loading the quote itself.
  if (intentQ.isLoading || !intent) {
    return <LoadingCard intentId={intentId} />;
  }

  // Terminal success — `useEffect` above navigates to `/pay-merchant/
  // receipt`. This render only shows for the single frame between
  // status flip and the navigation commit, so we keep it as a minimal
  // loader rather than a full receipt.
  if (
    phase === "settled" ||
    intent.status === "paid" ||
    intent.status === "paid_out"
  ) {
    return <PaidCard />;
  }

  if (isClientExpired && phase === "idle") {
    return (
      <PaymentError
        code="quote_expired"
        intentId={intentId}
        onRescan={() => router.back()}
        onBack={() => router.back()}
        onRetry={() => router.back()}
      />
    );
  }

  if (phase === "error" && error) {
    // Quote-expired takes the user back to the scanner; everything
    // else lets them re-tap the Pay button from an `idle` state.
    const resetToIdle = () => {
      setError(null);
      setPhase("idle");
    };
    const rescan = () => router.back();
    return (
      <PaymentError
        code={error.code}
        devMessage={
          error.code === "backend_not_ready"
            ? "Settle backend not ready (M3)"
            : error.devMessage
        }
        intentId={intentId}
        onRetry={resetToIdle}
        onBack={rescan}
        onRescan={rescan}
        onTopUp={resetToIdle}
      />
    );
  }

  // Path A (direct-on-Arc, task 40) — backend flips `intent.path = "A"`
  // when the user either has no Gateway deposit yet or the quote is
  // large enough that Nanopayments' batched settle is undesirable. The
  // branch lives on the server-set flag so there's no client-side
  // selector logic duplicated here.
  if (extractIntentPath(intent) === "A") {
    return (
      <PathACard
        intent={intent}
        intentId={intentId}
        onBack={() => router.back()}
      />
    );
  }

  return <QuoteCard intent={intent} phase={phase} onPay={onPay} />;
}

/** ── Path A — direct-on-Arc (spec §5.1, milestone M5) ──────────────── */

/**
 * Single-card Path A flow. Separate from `QuoteCard` because the
 * confirmation narrative is different: no "submitting to Circle,"
 * no batched attestation — the chain itself IS the receipt.
 *
 * Mirrors `IntentFlow`'s pre-flight chain switch so biometrics prompt
 * against Arc even if the user was last on a non-Arc chain. Fires the
 * on-chain receipt POST + viem-side receipt poll in parallel once the
 * wallet broadcasts, then flips to `"settled"` once both settle. The
 * backend watcher reconciles via `Transfer` events so the polling
 * query upstream in `IntentFlow` lands on `"paid"` independently of
 * this card's local state.
 */
function PathACard({
  intent,
  intentId,
  onBack,
}: {
  intent: PaymentIntentResponse;
  intentId: string;
  onBack: () => void;
}) {
  const {
    activeWallet,
    activeChain,
    getActiveWalletKit,
    changeActiveChainToConfig,
  } = useWallet();

  const [phase, setPhase] = useState<LocalPhase>("idle");
  const [error, setError] = useState<LocalError | null>(null);

  const onSend = useCallback(async () => {
    if (!activeWallet?.namespace) {
      setError({ code: "wallet_unsupported" });
      setPhase("error");
      return;
    }
    const kit = getActiveWalletKit();

    // Chain flip — Path A is Arc-only (enforced inside `executePathA`
    // via `nativeCurrency.symbol === "USDC"`). Re-use the pre-flight
    // switch so biometrics prompt on the right network.
    const sourceChainId = intent.usdcSourceChainId ?? ARC_TESTNET_CHAIN_ID;
    const sourceChainConfig = findEvmChainById(sourceChainId);
    if (!sourceChainConfig) {
      setError({
        code: "chain_mismatch",
        devMessage: `No chain config for id=${sourceChainId}`,
      });
      setPhase("error");
      return;
    }
    const activeEvmChainId =
      activeChain.namespace === "eip155" ? activeChain.chain.id : null;
    if (activeEvmChainId !== sourceChainId) {
      const ok = await changeActiveChainToConfig(sourceChainConfig);
      if (!ok) {
        setError({ code: "chain_mismatch" });
        setPhase("error");
        return;
      }
    }

    try {
      setPhase("signing");
      setError(null);

      const usdcAmount = BigInt(intent.usdcAmountMicros);
      const result = await executePathA({
        payer: activeWallet.address as `0x${string}`,
        merchantAddress: intent.usdcTreasuryAddress,
        usdcAmount,
        chain: sourceChainConfig,
        wallet: activeWallet,
        walletKit: kit,
      });

      setPhase("submitting");
      // Fire the backend hint + on-chain receipt watcher in parallel.
      // The hint is best-effort (endpoint may 404 during M5 rollout);
      // the watcher is authoritative.
      await Promise.all([
        postOnChainReceipt({
          intentId,
          txHash: result.txHash,
          chainId: result.chainId,
          poster: defaultOnChainReceiptPoster,
        }).catch(() => null),
        watchArcPayoutEvent({
          chain: sourceChainConfig,
          txHash: result.txHash,
        }),
      ]);

      // Local "done" — the backend `Transfer`-event watcher will flip
      // `intent.status` to `"paid"` once it observes the event, at
      // which point `IntentFlow`'s effect navigates to the receipt.
      setPhase("settled");
    } catch (err) {
      setError(classifyError(err));
      setPhase("error");
    }
  }, [
    activeChain,
    activeWallet,
    changeActiveChainToConfig,
    getActiveWalletKit,
    intent,
    intentId,
  ]);

  if (phase === "error" && error) {
    const resetToIdle = () => {
      setError(null);
      setPhase("idle");
    };
    return (
      <PaymentError
        code={error.code}
        devMessage={error.devMessage}
        intentId={intentId}
        onRetry={resetToIdle}
        onBack={onBack}
        onRescan={onBack}
        onTopUp={resetToIdle}
      />
    );
  }

  const isBusy = phase === "signing" || phase === "submitting";
  const ctaLabel =
    phase === "signing"
      ? "Confirming…"
      : phase === "submitting"
        ? "Confirming payment…"
        : "Send USDC";

  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <View className="flex-row items-center mb-5">
        <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
          <Store color="#c71c4b" size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-light-matte-black font-semibold text-base">
            {extractMerchantName(intent)}
          </Text>
          <Text className="text-light-matte-black/50 text-xs">
            Pay via direct transfer. Confirmation in ~2 seconds.
          </Text>
        </View>
      </View>

      <View className="bg-light-main-container rounded-xl p-4 mb-6">
        <Text className="text-light-matte-black/50 text-xs mb-1">Amount</Text>
        <Text className="text-light-matte-black text-3xl font-bold">
          {formatIdrMinor(extractFiatMinor(intent))}
        </Text>
        <Text className="text-light-matte-black/60 text-sm mt-2">
          ~{formatUsdcMicros(intent.usdcAmountMicros)} from your balance
        </Text>
      </View>

      {phase === "submitting" ? (
        <View className="flex-row items-center justify-center mb-4">
          <ActivityIndicator size="small" color="#c71c4b" />
          <Text className="text-light-matte-black/60 text-sm ml-2">
            Waiting for confirmation…
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.7}
        className={`py-4 px-5 rounded-xl items-center ${
          isBusy ? "bg-light-matte-black/20" : "bg-light-primary-red"
        }`}
        disabled={isBusy}
        onPress={onSend}
      >
        {isBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-light font-semibold">{ctaLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/**
 * Default poster for `/v1/pay/intents/:id/on-chain-receipt` wired to
 * the shared `api` ky instance. `postOnChainReceipt` swallows a 404
 * from here so the user's on-chain settle is never gated on backend
 * deploy timing.
 */
async function defaultOnChainReceiptPoster({
  intentId,
  body,
}: {
  intentId: string;
  body: OnChainReceiptRequest;
}): Promise<OnChainReceiptResponse> {
  return api
    .post(onChainReceiptEndpoint(intentId), { json: body })
    .json<OnChainReceiptResponse>();
}

/** ── fallback path: mint an intent from the scanned raw payload ─────── */

function MintFallback({ kind, raw }: { kind: MerchantKind; raw: string }) {
  const createIntent = useCreateIntent();
  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<LocalError | null>(null);

  // Lightweight TLV walk for the static-vs-dynamic QRIS branch. Scanner
  // already validated CRC upstream so we stay lenient here.
  const staticAmount = useMemo(() => {
    if (kind !== "qris") return undefined;
    const trimmed = raw.trim();
    if (!trimmed.startsWith("000201")) return undefined;
    let i = 0;
    while (i + 4 <= trimmed.length) {
      const tag = trimmed.slice(i, i + 2);
      const lenStr = trimmed.slice(i + 2, i + 4);
      if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) return undefined;
      const length = Number.parseInt(lenStr, 10);
      const start = i + 4;
      const end = start + length;
      if (end > trimmed.length) return undefined;
      if (tag === "54") {
        const v = trimmed.slice(start, end);
        if (/^\d+(?:\.\d+)?$/.test(v)) {
          const n = Number.parseInt(v.split(".")[0], 10);
          return Number.isFinite(n) ? n : undefined;
        }
        return undefined;
      }
      i = end;
    }
    return undefined;
  }, [kind, raw]);

  const needsAmount = staticAmount === undefined;

  const onMint = useCallback(async () => {
    setError(null);
    const amountMinor = staticAmount ?? Number.parseInt(amountInput, 10);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError({ code: "unknown", devMessage: "amount must be > 0" });
      return;
    }
    try {
      const created = await createIntent.mutateAsync({
        scannedPayload: raw,
        currency: "IDR",
        fiatAmountMinor: amountMinor,
      });
      // Replace so the user's back button returns to the scanner, not
      // to this fallback screen. The new URL is the canonical form.
      // Cast matches the pattern used in `app/scan-to-pay.tsx` —
      // `/pay-merchant` isn't yet in the generated typed-routes union.
      router.replace({
        pathname: "/pay-merchant" as "/send",
        params: { intentId: created.id },
      });
    } catch (err) {
      setError(classifyError(err));
    }
  }, [amountInput, createIntent, raw, staticAmount]);

  if (error) {
    const dismiss = () => setError(null);
    return (
      <PaymentError
        code={error.code}
        devMessage={error.devMessage}
        onRetry={dismiss}
        onBack={dismiss}
        onRescan={() => router.back()}
        onTopUp={dismiss}
      />
    );
  }

  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <View className="flex-row items-center mb-5">
        <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
          <Store color="#c71c4b" size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-light-matte-black font-semibold text-base">
            {kind === "qris" ? "QRIS merchant" : "TakumiPay merchant"}
          </Text>
          <Text className="text-light-matte-black/50 text-xs">
            Confirm amount to create a payment
          </Text>
        </View>
      </View>

      {needsAmount ? (
        <View className="mb-6">
          <Text className="text-light-matte-black/60 text-sm mb-2">
            Amount (IDR)
          </Text>
          <TextInput
            value={amountInput}
            onChangeText={(t) => setAmountInput(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="0"
            className="bg-light-main-container rounded-xl px-4 py-3 text-light-matte-black text-base"
          />
        </View>
      ) : (
        <View className="bg-light-main-container rounded-xl p-4 mb-6">
          <Text className="text-light-matte-black/50 text-xs mb-1">Amount</Text>
          <Text className="text-light-matte-black text-xl font-bold">
            {formatIdrMinor(staticAmount as number)}
          </Text>
        </View>
      )}

      <TouchableOpacity
        activeOpacity={0.7}
        className={`py-4 px-5 rounded-xl items-center ${
          createIntent.isPending
            ? "bg-light-matte-black/20"
            : "bg-light-primary-red"
        }`}
        disabled={createIntent.isPending}
        onPress={onMint}
      >
        {createIntent.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-light font-semibold">Continue</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/** ── UI cards ───────────────────────────────────────────────────────── */

function LoadingCard({ intentId }: { intentId: string }) {
  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <View className="flex-row items-center mb-4">
        <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
          <Store color="#c71c4b" size={20} />
        </View>
        <Text className="text-light-matte-black font-semibold text-base">
          Loading payment…
        </Text>
      </View>
      <View className="flex-row items-center">
        <ActivityIndicator size="small" color="#c71c4b" />
        <Text className="text-light-matte-black/60 text-sm ml-2">
          Fetching quote
        </Text>
      </View>
      {__DEV__ ? (
        <Text
          className="text-light-matte-black/30 font-mono text-xs mt-4"
          selectable
        >
          {intentId}
        </Text>
      ) : null}
    </View>
  );
}

function QuoteCard({
  intent,
  phase,
  onPay,
}: {
  intent: PaymentIntentResponse;
  phase: LocalPhase;
  onPay: () => void;
}) {
  const isBusy = phase === "signing" || phase === "submitting";
  const ctaLabel =
    phase === "signing"
      ? "Confirming…"
      : phase === "submitting"
        ? "Submitting…"
        : `Pay ${formatIdrMinor(extractFiatMinor(intent))}`;

  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <View className="flex-row items-center mb-5">
        <View className="w-11 h-11 bg-light-primary-red/10 rounded-full items-center justify-center mr-3">
          <Store color="#c71c4b" size={20} />
        </View>
        <View className="flex-1">
          <Text className="text-light-matte-black font-semibold text-base">
            {extractMerchantName(intent)}
          </Text>
          <Text className="text-light-matte-black/50 text-xs">
            Confirm to pay
          </Text>
        </View>
      </View>

      <View className="bg-light-main-container rounded-xl p-4 mb-6">
        <Text className="text-light-matte-black/50 text-xs mb-1">Amount</Text>
        <Text className="text-light-matte-black text-3xl font-bold">
          {formatIdrMinor(extractFiatMinor(intent))}
        </Text>
        <Text className="text-light-matte-black/60 text-sm mt-2">
          ~{formatUsdcMicros(intent.usdcAmountMicros)} from your balance
        </Text>
      </View>

      {phase === "submitting" ? (
        <View className="flex-row items-center justify-center mb-4">
          <ActivityIndicator size="small" color="#c71c4b" />
          <Text className="text-light-matte-black/60 text-sm ml-2">
            Submitting to Circle…
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.7}
        className={`py-4 px-5 rounded-xl items-center ${
          isBusy ? "bg-light-matte-black/20" : "bg-light-primary-red"
        }`}
        disabled={isBusy}
        onPress={onPay}
      >
        {isBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-light font-semibold">{ctaLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

/**
 * Transient "paid" loader — the `IntentFlow` effect navigates to
 * `/pay-merchant/receipt` the moment `intent.status === "paid"`, but
 * React commits this render first. Keep the UI on-brand during that
 * ~1-frame window rather than flashing the quote card or a blank
 * screen. All the actual receipt rendering lives in
 * `app/pay-merchant/receipt.tsx`.
 */
function PaidCard() {
  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <View className="items-center">
        <View className="w-14 h-14 bg-green-100 rounded-full items-center justify-center mb-3">
          <CheckCircle2 color="#16a34a" size={32} />
        </View>
        <Text className="text-light-matte-black font-bold text-xl">Paid</Text>
        <View className="flex-row items-center mt-3">
          <ActivityIndicator size="small" color="#c71c4b" />
          <Text className="text-light-matte-black/60 text-sm ml-2">
            Opening receipt…
          </Text>
        </View>
      </View>
    </View>
  );
}

function MissingIntentCard() {
  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <Text className="text-light-matte-black font-semibold text-base mb-2">
        Missing intent
      </Text>
      <Text className="text-light-matte-black/60 text-sm mb-6">
        We couldn't find a payment intent for this link. Scan a merchant QR or
        open a valid payment link to continue.
      </Text>
      <TouchableOpacity
        activeOpacity={0.7}
        className="bg-light-primary-red py-4 px-5 rounded-xl items-center"
        onPress={() => router.back()}
      >
        <Text className="text-light font-semibold">Back</Text>
      </TouchableOpacity>
    </View>
  );
}

/** ── intent-shape helpers ───────────────────────────────────────────── */

/**
 * Merchant display name. The M2 intent schema doesn't guarantee a
 * merchant field (task 27 `GET /v1/merchants/:id` is a follow-up) —
 * we duck-check a few likely fields so the UI lights up whenever the
 * backend starts populating one, and fall back to "Merchant" otherwise.
 */
function extractMerchantName(intent: PaymentIntentResponse): string {
  const anyIntent = intent as unknown as {
    merchant?: { displayName?: string; name?: string };
    merchantName?: string;
  };
  return (
    anyIntent.merchant?.displayName ??
    anyIntent.merchant?.name ??
    anyIntent.merchantName ??
    "Merchant"
  );
}

/**
 * Settlement path selector — `"A"` for direct-on-Arc, `"B"` / `"C"` for
 * Circle Nanopayments / raw x402. The server sets this on the intent
 * (task 41 owns the selector logic); mobile presence-reads to pick a
 * render branch. Duck-checked because the M2 `types.ts` doesn't pin
 * this field yet — task 40 ships the mobile render ahead of the type
 * update so the two PRs can land independently.
 */
function extractIntentPath(
  intent: PaymentIntentResponse,
): "A" | "B" | "C" | null {
  const anyIntent = intent as unknown as {
    path?: string;
    settlementPath?: string;
  };
  const raw = anyIntent.path ?? anyIntent.settlementPath;
  if (raw === "A" || raw === "B" || raw === "C") return raw;
  return null;
}

/**
 * Source-of-truth fiat amount shown to the user. The M2 shape in
 * `types.ts` doesn't pin this field (task 23 backend is still
 * iterating), so we duck-check for a few likely locations. Returns 0
 * when nothing is available — that's a visible "Rp 0" which will
 * surface the upstream contract gap loudly rather than silently.
 */
function extractFiatMinor(intent: PaymentIntentResponse): number {
  const anyIntent = intent as unknown as {
    fiat?: { amountMinor?: number };
    fiatAmountMinor?: number;
    amountMinor?: number;
  };
  return (
    anyIntent.fiat?.amountMinor ??
    anyIntent.fiatAmountMinor ??
    anyIntent.amountMinor ??
    0
  );
}
