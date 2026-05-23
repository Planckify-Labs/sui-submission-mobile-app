import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { AlertTriangle, RotateCcw, SquarePen } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import type { ConversationSummary } from "@/api/conversations.types";
import ApprovalSheet, {
  buildGrantOptions,
  type GrantChoice,
  specialWarning,
} from "@/components/agent/ApprovalSheet";
import type {
  ConversationCache,
  ConversationListCache,
  StoredMessage,
} from "@/hooks/queries/useConversations";
import { useAgentBusyPublisher } from "@/hooks/useAgentBusy";
import { useAgentOnboarding } from "@/hooks/useAgentOnboarding";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { useWallet } from "@/hooks/useWallet";
import { chatConvKey, chatListKey } from "@/lib/storage/chatKeys";
import { storage } from "@/lib/storage/mmkv";
import { activeConvRegistry } from "@/services/activeConvRegistry";
import {
  assertRegistryParity,
  type ExecutorContext,
} from "@/services/agent-executors";
import { checkPointsAuth } from "@/services/agent-executors/pointsAuth";
import {
  type ServerModelMessage,
  toAgentMessages,
} from "@/services/agent-messages/translate";
import type {
  AgentMessage,
  AgentMessagePart,
} from "@/services/agent-messages/types";
import {
  type AgentSession,
  type AgentSessionUIBindings,
  createAgentSession,
  type ToolPendingPayload,
  type WalletContext,
} from "@/services/agentSession";
import { pendingTxStore } from "@/services/pendingTxStore";
import { PermissionGrantStore } from "@/services/permissionGrantStore";
import {
  type ConnectedWallet,
  HOT_WALLET_POLICY,
} from "@/services/resolveUxTreatment";
import { getTransferThresholdStore } from "@/services/transferThresholdStore";
import {
  formatChainLabel,
  getEvmChainId,
  getNativeSymbol,
} from "@/services/walletKit/chainInfo";
import * as walletService from "@/services/walletService";
import AgentOnboarding from "./AgentModeOnboarding/AgentOnboarding";
import ChatInput from "./ChatInput";
import ConversationHistory from "./ConversationHistory";
import MessageContent from "./MessageContent";
import { paidAcknowledgement } from "./mintPaymentIntentTool";
import QuickPrompts from "./QuickPrompts";
import { useMintPaymentIntentTool } from "./useMintPaymentIntentTool";

const { width: screenWidth } = Dimensions.get("window");

type ChatMessage = AgentMessage;

function getMessageText(msg: ChatMessage): string {
  return msg.parts
    .filter(
      (p): p is Extract<AgentMessagePart, { type: "text" }> =>
        p.type === "text",
    )
    .map((p) => p.text)
    .join("");
}

function appendDeltaToParts(
  parts: AgentMessagePart[],
  delta: string,
): AgentMessagePart[] {
  if (parts.length === 0) {
    return [{ type: "text", text: delta }];
  }
  const last = parts[parts.length - 1];
  if (last.type === "text") {
    return [...parts.slice(0, -1), { type: "text", text: last.text + delta }];
  }
  return [...parts, { type: "text", text: delta }];
}

type InlinePreview = {
  payload: ToolPendingPayload;
  onConfirm: () => void;
  onDismiss: () => void;
};

type ApprovalState = {
  payload: ToolPendingPayload;
  onApprove: () => void;
  onReject: () => void;
};

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toStoredMessage(msg: ChatMessage): StoredMessage {
  // Persist parts so a later reload can render real cards.
  const text = getMessageText(msg);
  return {
    role: msg.role === "system" ? "assistant" : msg.role,
    content: text,
    raw: {
      id: msg.id,
      role: msg.role,
      content: msg.parts,
      created_at: msg.createdAt,
    },
    created_at: msg.createdAt || new Date().toISOString(),
  };
}

// Parts-aware history loading. If the StoredMessage's `raw` carries the
// canonical ModelMessage parts, run them through the translator. Otherwise
// fall back to a single text part derived from `content`.
function fromStoredMessages(stored: StoredMessage[]): ChatMessage[] {
  const serverMessages: ServerModelMessage[] = [];
  let hasRichRaw = false;
  for (const s of stored) {
    const raw = s.raw as
      | {
          id?: string;
          role?: string;
          content?: unknown;
          created_at?: string;
        }
      | null
      | undefined;
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { content?: unknown }).content)
    ) {
      hasRichRaw = true;
      serverMessages.push({
        role: (raw.role ?? s.role) as "user" | "assistant" | "tool" | "system",
        content: raw.content as ServerModelMessage["content"],
        id: raw.id,
        created_at: raw.created_at ?? s.created_at,
      } as ServerModelMessage);
    } else {
      serverMessages.push({
        role: s.role === "tool" ? "assistant" : s.role,
        content: s.content,
        created_at: s.created_at,
      } as ServerModelMessage);
    }
  }
  if (hasRichRaw) {
    return toAgentMessages(serverMessages).map((m) => ({
      ...m,
      id: m.id || genId(),
    }));
  }
  // Legacy text-only cache fallback.
  return stored.map((m) => ({
    id: genId(),
    role: m.role === "tool" ? "assistant" : (m.role as "user" | "assistant"),
    parts: [{ type: "text", text: m.content }],
    createdAt: m.created_at,
  }));
}

function getLastAssistantText(msgs: ChatMessage[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "assistant") continue;
    const text = getMessageText(msgs[i]);
    if (text) return text;
  }
  return "";
}

function resolveMode(
  message: ChatMessage,
  streamingMessageId: string | null,
): "live" | "historical" {
  return message.id === streamingMessageId ? "live" : "historical";
}

export default function AgentMode() {
  const scrollViewRef = useRef<ScrollView>(null);
  const [input, setInput] = useState("");
  const lastSendTimeRef = useRef<number>(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Onboarding state
  const {
    shouldShowOnboarding,
    isLoading: isOnboardingLoading,
    completeOnboarding,
  } = useAgentOnboarding();

  const { activeWallet, activeChain } = useWallet();
  const { data: blockchains = [] } = useBlockchainsWithStorage({
    isActive: true,
  });

  // Agent-mode integration slot (task 46): `mintPaymentIntent` AI tool.
  // The hook owns (a) the Idempotency-Key cache so retries collapse to
  // the same `pi_…` id server-side, (b) the `/pay-merchant?intentId=…`
  // hand-off, and (c) the cross-screen "intent-paid" event bus. The
  // wallet still owns signing + submission — this hook never touches
  // the signer (three-role separation).
  const mintIntentTool = useMintPaymentIntentTool();

  // ── Conversation state ────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [inlinePreview, setInlinePreview] = useState<InlinePreview | null>(
    null,
  );
  const [approvalState, setApprovalState] = useState<ApprovalState | null>(
    null,
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );

  // §10 — retryable / non-retryable SSE error UX. The spec splits errors
  // into two buckets:
  //   - retryable (model_error, max_iterations, tool_timeout) → "Try
  //     again" affordance that re-POSTs the same session_id with the
  //     last user message.
  //   - non-retryable (session_error, internal_error) → prompt the user
  //     to start a fresh conversation.
  // Only one of these is ever set at a time; sending a new message or
  // tapping the action clears it.
  const [retryableError, setRetryableError] = useState<string | null>(null);
  const [nonRetryableError, setNonRetryableError] = useState<string | null>(
    null,
  );

  // ── Conversation persistence state (task 10) ─────────────────────
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const queryClient = useQueryClient();

  // ── Refs used by the session (outside React render tree) ──────────
  const sessionIdRef = useRef<string | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const activeSessionRef = useRef<AgentSession | null>(null);
  // Stores the most recent user message text so a "Try again" tap can
  // re-issue the same turn on the same `session_id`.
  const lastUserMessageRef = useRef<string>("");
  const grantStoreRef = useRef<{
    address: `0x${string}`;
    store: PermissionGrantStore;
  } | null>(null);
  // Mirrors of preview/approval state so `sendTextMessage` and the
  // cross-screen cancel handler can read the latest value without
  // re-creating their useCallback on every state change.
  const inlinePreviewRef = useRef<InlinePreview | null>(null);
  const approvalStateRef = useRef<ApprovalState | null>(null);
  // Registry of dispatcher callbacks keyed by `tool_call_id`. The inline
  // StructuredUI card resolves via `addToolResult`; we look up the
  // stashed onConfirm/onDismiss here and call the right one.
  const toolDecisionsRef = useRef<
    Map<string, { onConfirm: () => void; onDismiss: () => void }>
  >(new Map());
  useEffect(() => {
    inlinePreviewRef.current = inlinePreview;
  }, [inlinePreview]);
  useEffect(() => {
    approvalStateRef.current = approvalState;
  }, [approvalState]);

  // Mirror of `messages` state for use inside memoized callbacks (task 10)
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Registry parity check — crash loudly at mount time if the mobile
  // executor registry drifted from the server tool list.
  useEffect(() => {
    try {
      assertRegistryParity();
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Rebuild / reuse the wallet-scoped grant store whenever the active
  // wallet changes. The store is lazy-loaded from SecureStore — keeping
  // a ref means we don't re-hydrate on every render.
  const grantStore = useMemo(() => {
    const address = activeWallet?.address as `0x${string}` | undefined;
    if (!address) return null;
    if (grantStoreRef.current?.address === address) {
      return grantStoreRef.current.store;
    }
    const store = PermissionGrantStore.conservative(address);
    grantStoreRef.current = { address, store };
    return store;
  }, [activeWallet?.address]);

  // Snapshot the wallet's transfer thresholds. Re-snapshots whenever
  // the active wallet changes OR the store emits a change event (the
  // settings screen mutates the same per-wallet store instance via
  // `getTransferThresholdStore`, so edits propagate here without any
  // explicit cross-screen wiring).
  const [thresholdRev, bumpThresholdRev] = useState(0);
  useEffect(() => {
    const address = activeWallet?.address as `0x${string}` | undefined;
    if (!address) return;
    const store = getTransferThresholdStore(address);
    return store.subscribe(() => bumpThresholdRev((n) => n + 1));
  }, [activeWallet?.address]);

  const transferThresholdsSnapshot = useMemo(() => {
    const address = activeWallet?.address as `0x${string}` | undefined;
    if (!address) return undefined;
    return getTransferThresholdStore(address).snapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- thresholdRev is the explicit re-snapshot trigger
  }, [activeWallet?.address, thresholdRev]);

  // ConnectedWallet — plumbed into `resolveUxTreatment` via the session.
  const connectedWallet: ConnectedWallet | null = useMemo(() => {
    const address = activeWallet?.address as `0x${string}` | undefined;
    if (!address || !grantStore) return null;
    return {
      address,
      approvalPolicy: HOT_WALLET_POLICY,
      grantStore,
      transferThresholds: transferThresholdsSnapshot,
    };
  }, [activeWallet?.address, grantStore, transferThresholdsSnapshot]);

  // Executor context — forwarded to every mobile tool call.
  // `activeChainId` is the fallback the executors use when the agent
  // drops `chain_id` from a tool input (the server's mobile-tool
  // schema is a permissive `{}` stub, so the LLM is not schema-bound
  // to always include it).
  const activeChainId = getEvmChainId(activeChain);

  // Derive the viem account separately from blockchains so key
  // derivation (mnemonicToAccount) only runs on wallet changes, not on
  // every blockchains refresh. Returns null for Solana wallets — they
  // use their own signer path (getSolanaSignerForWallet).
  const evmAccount = useMemo(
    () =>
      activeWallet
        ? (walletService.getAccountForWallet(activeWallet) ?? null)
        : null,
    [activeWallet],
  );

  const executorContext: ExecutorContext | null = useMemo(() => {
    if (!activeWallet?.address) return null;
    return {
      wallet: activeWallet,
      account: evmAccount,
      blockchains,
      activeChainId,
    };
  }, [activeWallet, evmAccount, blockchains, activeChainId]);

  // Points / redemption auth hint for `wallet_context.points_authenticated`
  // (protocol v1.1 §13). Read locally from secure storage on every
  // wallet change, and just-in-time before each send via
  // `sendTextMessage` — a fresh token from the `request_authentication`
  // executor flips this to `true` on the next turn without requiring
  // a full page reload.
  const [pointsAuthenticated, setPointsAuthenticated] =
    useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const addr = activeWallet?.address as `0x${string}` | undefined;
    if (!addr) {
      setPointsAuthenticated(false);
      return;
    }
    checkPointsAuth(addr).then((authed) => {
      if (!cancelled) setPointsAuthenticated(authed);
    });
    return () => {
      cancelled = true;
    };
  }, [activeWallet?.address]);

  // Wallet context sent on POST /chat — short-circuits if we don't yet
  // have an active wallet / chain resolved. Stays chain-agnostic per
  // §4.5 (space-docking): chain_id / chain_name / chain_symbol come
  // from `WalletKitAdapter` hooks so every namespace is exposed the
  // same way and adding a new chain doesn't require edits here.
  //
  // `chain_id` is 0 for non-EVM namespaces — the server treats the
  // field as opaque for non-EVM and reads `namespace` as the real
  // discriminator. EVM kits return the viem `chain.id` via
  // `getEvmChainId`.
  const walletContext: WalletContext | null = useMemo(() => {
    const address = activeWallet?.address;
    if (!address) return null;
    const symbol = getNativeSymbol(activeChain);
    if (!symbol) return null;
    // `capabilities` surfaces mobile-resolved tools alongside the
    // wallet's `namespace` discriminator (memory
    // `feedback_agent_prompt_namespace.md`). Listing a tool here does
    // NOT claim it is "EVM-only" / "Solana-only" — the server's tool
    // router makes that call per-namespace. The mobile merely advertises
    // what the scan-to-pay slot (task 46) offers on this device.
    //
    // The field is a forward-compat extension; the server treats
    // unknown wallet_context keys as opaque metadata so older builds
    // ignore it safely.
    const capabilities = ["mintPaymentIntent"] as const;
    return {
      address,
      namespace: activeChain.namespace,
      chain_id: getEvmChainId(activeChain) ?? 0,
      chain_name: formatChainLabel(activeChain),
      chain_symbol: symbol,
      label: activeWallet?.name,
      points_authenticated: pointsAuthenticated,
      // Cast to permissive shape — `capabilities` isn't in the
      // `WalletContext` wire type (`protocol.ts` is a verbatim mirror
      // of the server file). Adding it here avoids editing the mirrored
      // wire type while still sending the hint.
      ...({ capabilities } as { capabilities: readonly string[] }),
    };
  }, [activeWallet, activeChain, pointsAuthenticated]);

  const chatListRef = useRef<any>(null);

  // ── Keyboard-aware list padding ─────────────────────────────────
  // The ChatInput is absolute-positioned and floats up with the
  // keyboard via its own KeyboardAvoidingView. The FlashList beneath
  // it doesn't resize, so without extra padding the latest messages
  // get hidden behind the keyboard. Track keyboard height and add it
  // to the list's bottom padding so the user can still scroll to the
  // tail while typing.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Auto-scroll state ───────────────────────────────────────────
  const autoScrollEnabledRef = useRef(true);
  const userScrollCountRef = useRef(0);
  const scrollInactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const resetAutoScroll = useCallback(() => {
    autoScrollEnabledRef.current = true;
    userScrollCountRef.current = 0;
    if (scrollInactivityTimerRef.current) {
      clearTimeout(scrollInactivityTimerRef.current);
      scrollInactivityTimerRef.current = null;
    }
  }, []);

  const handleUserScrollBeginDrag = useCallback(() => {
    userScrollCountRef.current += 1;

    // After 2 manual scrolls, pause auto-scroll
    if (userScrollCountRef.current >= 2) {
      autoScrollEnabledRef.current = false;
    }

    // Reset inactivity timer — re-enable auto-scroll after 4s of no scrolling
    if (scrollInactivityTimerRef.current) {
      clearTimeout(scrollInactivityTimerRef.current);
    }
    scrollInactivityTimerRef.current = setTimeout(() => {
      resetAutoScroll();
    }, 4000);
  }, [resetAutoScroll]);

  // Auto-scroll to bottom when messages change or streaming status changes
  useEffect(() => {
    if (autoScrollEnabledRef.current && messages.length > 0) {
      const timeout = setTimeout(() => {
        chatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [messages]);

  // Cleanup inactivity timer on unmount
  useEffect(() => {
    return () => {
      if (scrollInactivityTimerRef.current) {
        clearTimeout(scrollInactivityTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: screenWidth, animated: false });
    }, 0);
  }, []);

  // Tear down any in-flight session when the screen unmounts.
  useEffect(() => {
    return () => {
      activeSessionRef.current?.stop();
      activeSessionRef.current = null;
    };
  }, []);

  // Shared "reject any open preview/approval" step — the callbacks
  // post a typed `user_declined` to the server via a fresh fetch
  // (independent of SSE) so the conversation history records the
  // cancellation cleanly even after we close the stream.
  const rejectOpenPrompts = useCallback(() => {
    const stalePreview = inlinePreviewRef.current;
    const staleApproval = approvalStateRef.current;
    if (stalePreview) {
      try {
        stalePreview.onDismiss();
      } catch (err) {
        console.warn("[AgentMode] preview dismiss threw", err);
      }
    }
    if (staleApproval) {
      try {
        staleApproval.onReject();
      } catch (err) {
        console.warn("[AgentMode] approval reject threw", err);
      }
    }
  }, []);

  // SOFT stop — used by the chat "stop" button. Closes the current
  // turn but preserves the conversation so the user can keep chatting:
  //   • messages stay rendered (including the partial assistant reply)
  //   • activeConversationId stays so the next send continues the
  //     same server-side thread
  //   • sessionIdRef stays so "Try again" still works
  //   • pendingTxStore stays so an already-broadcast tx remains
  //     visible on its explorer card
  // What we DO clear: the SSE stream, streaming flags, any open
  // preview/approval (rejected as user_declined).
  const stopAgent = useCallback(() => {
    rejectOpenPrompts();
    activeSessionRef.current?.stop();
    activeSessionRef.current = null;
    setCurrentStatus(null);
    setInlinePreview(null);
    setApprovalState(null);
    setIsStreaming(false);
    setStreamingMessageId(null);
  }, [rejectOpenPrompts]);

  // HARD reset — used by the "New conversation" button, the
  // wallet-change effect, and the cross-screen "Cancel task & switch"
  // dialog. Drops every piece of chat state so the next send starts a
  // fresh server-side conversation with no carry-over.
  const hardResetAgent = useCallback(() => {
    rejectOpenPrompts();
    activeSessionRef.current?.stop();
    activeSessionRef.current = null;
    sessionIdRef.current = null;
    currentAssistantIdRef.current = null;
    lastUserMessageRef.current = "";
    pendingTxStore.clear();
    // Drop the agent-mode integration slot's idempotency cache + any
    // pending intent-paid event so a fresh conversation doesn't
    // acknowledge a payment from the previous session.
    mintIntentTool.reset();
    setMessages([]);
    setCurrentStatus(null);
    setInlinePreview(null);
    setApprovalState(null);
    setIsStreaming(false);
    setStreamingMessageId(null);
    setRetryableError(null);
    setNonRetryableError(null);
    setActiveConversationId(null);
  }, [rejectOpenPrompts, mintIntentTool]);

  // ── Intent-paid event subscription (task 46) ──────────────────────
  // When the wallet finishes paying an intent the agent minted, the
  // receipt screen flips `intent-paid` in the global event bus
  // (`INTENT_PAID_EVENT_KEY`). We surface an inline assistant message
  // acknowledging the payment — three-role separation holds because
  // the agent NEVER signed anything; it's purely a readback of a
  // wallet-emitted event. No tx hashes / signatures in the copy
  // (enforced by `paidAcknowledgement` in `mintPaymentIntentTool.ts`).
  const ackedIntentPaidRef = useRef<string | null>(null);
  useEffect(() => {
    const { intentId, paidAt } = mintIntentTool.intentPaidEvent;
    if (!intentId || paidAt === null) return;
    if (ackedIntentPaidRef.current === intentId) return;
    ackedIntentPaidRef.current = intentId;

    const nowIso = new Date().toISOString();
    const ackMessage: ChatMessage = {
      id: genId(),
      role: "assistant",
      parts: [{ type: "text", text: paidAcknowledgement(intentId) }],
      createdAt: nowIso,
    };
    setMessages((prev) => [...prev, ackMessage]);
    mintIntentTool.acknowledgeIntentPaid();
  }, [mintIntentTool]);

  // ── Busy state publisher + cancel-handler registration ───────────
  // Exposes the agent's busy state globally so the wallet / chain
  // switchers (and anything else) can gate destructive actions with a
  // dialog. `cancelHandler` is a stable ref so publishing doesn't
  // churn when callers only care that `isBusy` flipped.
  const busy = useAgentBusyPublisher();
  const cancelHandlerRef = useRef<() => void>(() => hardResetAgent());
  useEffect(() => {
    cancelHandlerRef.current = () => hardResetAgent();
  }, [hardResetAgent]);

  useEffect(() => {
    const reason = isStreaming
      ? "thinking"
      : approvalState
        ? "awaiting_approval"
        : inlinePreview
          ? "awaiting_preview"
          : null;
    busy.publish({
      isBusy: reason !== null,
      reason,
      cancelHandler: reason !== null ? () => cancelHandlerRef.current() : null,
    });
  }, [isStreaming, approvalState, inlinePreview, busy]);

  // Publish `hasActiveChat` separately — it changes on message append
  // (every streaming delta), so colocating it with the busy-reason
  // effect would cause extra writes for no behavioural benefit. The
  // soft wallet-switch dialog reads this to decide whether switching
  // is disruptive enough to warrant a confirmation prompt.
  useEffect(() => {
    const hasActiveChat = messages.length > 0 || activeConversationId !== null;
    busy.publish({ hasActiveChat });
  }, [messages.length, activeConversationId, busy]);

  // On unmount, drop the busy snapshot so other screens don't think a
  // vanished session is still running.
  useEffect(() => {
    return () => busy.reset();
  }, [busy]);

  // ── Per-wallet partitioning ──────────────────────────────────────
  // When the active wallet changes, the previous wallet's chat state
  // (messages, activeConversationId, pending approvals, pendingTx
  // cards) must NOT remain in memory — they were produced with a
  // different signer, a different points-auth JWT, and potentially a
  // different chain. After clearing, re-hydrate from the new wallet's
  // scoped MMKV entries so toggling between wallets feels like
  // switching tabs rather than losing work.
  const hydratedWalletRef = useRef<string | null>(null);
  useEffect(() => {
    const addr = activeWallet?.address as `0x${string}` | undefined;
    if (!addr) {
      hydratedWalletRef.current = null;
      return;
    }
    const normalized = addr.toLowerCase();
    if (hydratedWalletRef.current === normalized) return;
    hydratedWalletRef.current = normalized;

    hardResetAgent();

    // Read the last active conversation from the in-memory registry
    // (NOT from MMKV). This is intentional — on cold start the
    // registry is empty, so the user gets a fresh chat. Only
    // in-session wallet toggles hydrate a prior thread here.
    const lastActive = activeConvRegistry.get(addr);
    if (!lastActive) return;
    const cached = storage.getString(chatConvKey(addr, lastActive));
    if (!cached) return;
    try {
      const conv = JSON.parse(cached) as ConversationCache;
      setMessages(fromStoredMessages(conv.messages));
      setActiveConversationId(lastActive);
    } catch (err) {
      console.warn("[AgentMode] failed to hydrate wallet chat cache", err);
    }
  }, [activeWallet?.address, hardResetAgent]);

  const handleScrollToChat = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: screenWidth, animated: true });
  }, []);

  const handleScrollToHistory = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
  }, []);

  // ── Resume a past conversation from MMKV cache (task 10) ─────────
  const resumeConversation = useCallback(
    (conversationId: string) => {
      activeSessionRef.current?.stop();
      activeSessionRef.current = null;
      sessionIdRef.current = null;
      setRetryableError(null);
      setNonRetryableError(null);
      setCurrentStatus(null);
      setInlinePreview(null);
      setApprovalState(null);
      setIsStreaming(false);
      setStreamingMessageId(null);
      pendingTxStore.clear();

      const walletAddress = activeWallet?.address as `0x${string}` | undefined;
      const cached = walletAddress
        ? storage.getString(chatConvKey(walletAddress, conversationId))
        : null;
      if (cached) {
        const conv = JSON.parse(cached) as ConversationCache;
        setMessages(fromStoredMessages(conv.messages));
      } else {
        setMessages([]);
      }

      setActiveConversationId(conversationId);
      if (walletAddress) {
        activeConvRegistry.set(walletAddress, conversationId);
      }
      handleScrollToChat();
    },
    [handleScrollToChat, activeWallet?.address],
  );

  // ── UI bindings the session dispatches into ──────────────────────
  // These are re-created on every turn so they capture the current
  // assistant message id and dispatch into React state. The session
  // holds the callbacks for its lifetime, so this is safe.
  const buildUiBindings = useCallback(
    (assistantMessageId: string): AgentSessionUIBindings => ({
      appendText: (delta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, parts: appendDeltaToParts(m.parts, delta) }
              : m,
          ),
        );
        setCurrentStatus(null);
      },
      upsertToolPart: (part) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMessageId) return m;
            const existingIdx = m.parts.findIndex(
              (p) => p.type === "tool" && p.toolCallId === part.toolCallId,
            );
            const nextPart: AgentMessagePart = {
              type: "tool",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              state: part.state,
              ...(part.output !== undefined ? { output: part.output } : {}),
              ...(part.error ? { error: part.error } : {}),
            };
            if (existingIdx >= 0) {
              const nextParts = [...m.parts];
              nextParts[existingIdx] = nextPart;
              return { ...m, parts: nextParts };
            }
            return { ...m, parts: [...m.parts, nextPart] };
          }),
        );
      },
      showStatus: (message) => {
        setCurrentStatus(message);
      },
      showPreviewCard: (payload, onConfirm, onDismiss) => {
        setCurrentStatus(null);
        const wrappedConfirm = () => {
          setInlinePreview((current) =>
            current?.payload.tool_call_id === payload.tool_call_id
              ? null
              : current,
          );
          toolDecisionsRef.current.delete(payload.tool_call_id);
          void onConfirm();
        };
        const wrappedDismiss = () => {
          setInlinePreview((current) =>
            current?.payload.tool_call_id === payload.tool_call_id
              ? null
              : current,
          );
          toolDecisionsRef.current.delete(payload.tool_call_id);
          void onDismiss();
        };
        toolDecisionsRef.current.set(payload.tool_call_id, {
          onConfirm: wrappedConfirm,
          onDismiss: wrappedDismiss,
        });
        setInlinePreview({
          payload,
          onConfirm: wrappedConfirm,
          onDismiss: wrappedDismiss,
        });
      },
      showApprovalSheet: (payload, onApprove, onReject) => {
        setCurrentStatus(null);
        setApprovalState({
          payload,
          onApprove: () => {
            setApprovalState((current) =>
              current?.payload.tool_call_id === payload.tool_call_id
                ? null
                : current,
            );
            void onApprove();
          },
          onReject: () => {
            setApprovalState((current) =>
              current?.payload.tool_call_id === payload.tool_call_id
                ? null
                : current,
            );
            void onReject();
          },
        });
      },
      showToolExecuted: () => {
        // Non-onchain tool just completed server-side. Clear the
        // status chip so the next event can paint its own label.
        setCurrentStatus(null);
      },
      showError: (message, retryable) => {
        // §10 — surface SSE error events as a chat-inline affordance.
        // Retryable errors (model_error, max_iterations, tool_timeout)
        // get a "Try again" button that re-POSTs the same session_id
        // with the last user message. Non-retryable errors
        // (session_error, internal_error) prompt the user to start a
        // fresh conversation instead.
        console.error(
          `[AgentMode] session error (retryable=${retryable}): ${message}`,
        );
        const fallback = retryable
          ? "Something went wrong. Try again?"
          : "Something went wrong. Please start a new conversation.";
        if (retryable) {
          setRetryableError(message?.length ? message : fallback);
          setNonRetryableError(null);
        } else {
          setNonRetryableError(message?.length ? message : fallback);
          setRetryableError(null);
        }
        setCurrentStatus(null);
        setIsStreaming(false);
        setStreamingMessageId(null);
      },
      done: (meta) => {
        setCurrentStatus(null);
        setIsStreaming(false);
        setStreamingMessageId(null);

        if (!meta?.conversation_id) return;

        const convId = meta.conversation_id;
        const walletAddress = walletContext?.address;
        if (!walletAddress) return;

        // 1. Write individual conversation cache
        const convCache: ConversationCache = {
          id: convId,
          title: meta.conversation_title,
          messages: messagesRef.current.map(toStoredMessage),
          cached_at: Date.now(),
        };
        storage.set(
          chatConvKey(walletAddress, convId),
          JSON.stringify(convCache),
        );
        activeConvRegistry.set(walletAddress, convId);

        // 2. Upsert summary into list cache. Must go through
        // `chatListKey()` so the write matches `useConversationList`'s
        // read — the helper lowercases the address; a raw
        // `chat:list:${walletAddress}` write would land at a
        // checksum-cased key the reader never looks at, silently
        // dropping the most-recent turn from the history panel.
        const listKey = chatListKey(walletAddress);
        const listRaw = storage.getString(listKey);
        const list: ConversationListCache = listRaw
          ? JSON.parse(listRaw)
          : { items: [], next_cursor: null, cached_at: Date.now() };

        const existingIdx = list.items.findIndex((c) => c.id === convId);
        const summary: ConversationSummary = {
          id: convId,
          title: meta.conversation_title,
          wallet_address: walletAddress,
          chain_id: activeChainId ?? 0,
          created_at:
            existingIdx >= 0
              ? list.items[existingIdx].created_at
              : new Date().toISOString(),
          updated_at: new Date().toISOString(),
          message_count: messagesRef.current.length,
          last_message_preview: getLastAssistantText(messagesRef.current).slice(
            0,
            120,
          ),
        };

        if (existingIdx >= 0) list.items[existingIdx] = summary;
        else list.items.unshift(summary);

        list.cached_at = Date.now();
        storage.set(listKey, JSON.stringify(list));

        // 3. Optimistically seed the TanStack Query cache so the
        // history panel updates in the same tick the turn completes —
        // not on the next server round-trip. Mirrors the pattern used
        // by `useDeleteConversation` / `useRenameConversation`. Without
        // this, the placeholderData path is only consulted when the
        // query has no data yet; once the server list is cached, fresh
        // MMKV writes are ignored until `invalidateQueries` refetches.
        queryClient.setQueryData<ConversationListCache>(
          ["conversations", walletAddress],
          (old) => {
            const base =
              old ??
              ({
                items: [],
                next_cursor: null,
                cached_at: 0,
              } as ConversationListCache);
            const idx = base.items.findIndex((c) => c.id === convId);
            const nextItems =
              idx >= 0
                ? base.items.map((c) => (c.id === convId ? summary : c))
                : [summary, ...base.items];
            return { ...base, items: nextItems, cached_at: Date.now() };
          },
        );

        // 4. Keep activeConversationId in sync for the next turn
        setActiveConversationId(convId);

        // 5. Invalidate TanStack Query for background server sync —
        // server is the source of truth; the optimistic row above is
        // replaced by the canonical one on the next refetch.
        queryClient.invalidateQueries({
          queryKey: ["conversations", walletAddress],
        });
      },
      onReconnecting: (attempt) => {
        setCurrentStatus(`Reconnecting… (attempt ${attempt})`);
      },
      // §1 — adopt the server's authoritative `session_id` as soon as
      // an SSE payload reveals it. Mirroring it back into
      // `sessionIdRef` keeps task 06's "Try again" path on the same
      // server-side session instead of minting a fresh one.
      onSessionIdChanged: (id) => {
        sessionIdRef.current = id;
      },
    }),
    [walletContext, activeChain, queryClient],
  );

  const sendTextMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (!walletContext || !connectedWallet || !executorContext) {
        console.warn(
          "[AgentMode] sendTextMessage called before wallet context was ready",
        );
        return;
      }

      // Refresh `points_authenticated` just-in-time — a successful
      // `request_authentication` executor in a previous turn may have
      // stored new tokens after the last `checkPointsAuth` effect ran.
      // This read is local (SecureStore) so it adds ~1ms per send.
      const freshPointsAuth = await checkPointsAuth(walletContext.address);
      if (freshPointsAuth !== pointsAuthenticated) {
        setPointsAuthenticated(freshPointsAuth);
      }
      const sendWalletContext: WalletContext = {
        ...walletContext,
        points_authenticated: freshPointsAuth,
      };

      const now = Date.now();
      const timeSinceLastSend = now - lastSendTimeRef.current;
      if (timeSinceLastSend < 1000) {
        console.log("Please wait before sending another message");
        return;
      }
      lastSendTimeRef.current = now;

      // Dismiss any stale preview / approval from a prior turn BEFORE
      // opening a new stream. These hold callbacks bound to the
      // about-to-be-stopped session; leaving them rendered lets the
      // user tap "Approve" on a stale card and trigger an executor the
      // new turn did not authorize. Invoking the wrapped onReject /
      // onDismiss both nulls the React state AND posts a typed
      // `user_declined` to the server so conversation history stays
      // clean.
      const stalePreview = inlinePreviewRef.current;
      const staleApproval = approvalStateRef.current;
      if (stalePreview) {
        try {
          stalePreview.onDismiss();
        } catch (err) {
          console.warn("[AgentMode] stale preview dismiss threw", err);
        }
      }
      if (staleApproval) {
        try {
          staleApproval.onReject();
        } catch (err) {
          console.warn("[AgentMode] stale approval reject threw", err);
        }
      }

      // Close any prior session first — a new turn opens its own stream.
      activeSessionRef.current?.stop();
      activeSessionRef.current = null;

      // §10 — a successful new send invalidates any stale error state
      // from a previous failed turn. Track the message so a future
      // "Try again" tap can re-issue it on the same session_id.
      lastUserMessageRef.current = trimmed;
      setRetryableError(null);
      setNonRetryableError(null);

      const nowIso = new Date().toISOString();
      const userMessage: ChatMessage = {
        id: genId(),
        role: "user",
        parts: [{ type: "text", text: trimmed }],
        createdAt: nowIso,
      };
      const assistantMessage: ChatMessage = {
        id: genId(),
        role: "assistant",
        parts: [],
        createdAt: nowIso,
      };
      currentAssistantIdRef.current = assistantMessage.id;
      setStreamingMessageId(assistantMessage.id);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInlinePreview(null);
      setApprovalState(null);
      setIsStreaming(true);
      setCurrentStatus("Thinking…");
      resetAutoScroll();

      const sessionId = sessionIdRef.current ?? genId();
      sessionIdRef.current = sessionId;

      const session = createAgentSession({
        session_id: sessionId,
        wallet_context: sendWalletContext,
        // Server-side schema accepts `{role, content}` ModelMessages.
        messages: [{ role: "user", content: trimmed }],
        conversation_id: activeConversationId ?? undefined,
        executorContext,
        connectedWallet,
        ui: buildUiBindings(assistantMessage.id),
      });
      activeSessionRef.current = session;

      try {
        await session.start();
      } catch (sendError) {
        // Stale conversation_id — the server no longer has this conversation
        // (e.g. after a restart). Clear it and retry transparently so the
        // user never sees an error for something they didn't cause.
        if (
          String(sendError).includes("conversation_not_found") &&
          activeConversationId
        ) {
          setActiveConversationId(null);
          const retrySessionId = genId();
          sessionIdRef.current = retrySessionId;
          const retrySession = createAgentSession({
            session_id: retrySessionId,
            wallet_context: sendWalletContext,
            messages: [{ role: "user", content: trimmed }],
            conversation_id: undefined,
            executorContext,
            connectedWallet,
            ui: buildUiBindings(assistantMessage.id),
          });
          activeSessionRef.current = retrySession;
          try {
            await retrySession.start();
          } catch (retryError) {
            console.error(
              "[AgentMode] Retry after conversation_not_found failed",
              retryError,
            );
            setIsStreaming(false);
            setStreamingMessageId(null);
            setCurrentStatus(null);
          }
          return;
        }
        console.error("[AgentMode] Failed to stream agent turn", sendError);
        setIsStreaming(false);
        setStreamingMessageId(null);
        setCurrentStatus(null);
      }
    },
    [
      walletContext,
      connectedWallet,
      executorContext,
      buildUiBindings,
      pointsAuthenticated,
      activeConversationId,
      resetAutoScroll,
    ],
  );

  const handleSend = useCallback(async () => {
    const pending = input.trim();
    if (!pending) return;

    await sendTextMessage(pending);
    setInput("");
  }, [input, sendTextMessage]);

  const handlePromptSelect = useCallback(
    async (prompt: string) => {
      await sendTextMessage(prompt);
    },
    [sendTextMessage],
  );

  // Reset conversation — new session id on next send. Also drops
  // the in-memory active-conversation pointer so a subsequent wallet
  // toggle doesn't silently rehydrate the thread the user just
  // abandoned.
  const handleNewConversation = useCallback(() => {
    const addr = activeWallet?.address as `0x${string}` | undefined;
    if (addr) activeConvRegistry.clear(addr);
    hardResetAgent();
  }, [activeWallet?.address, hardResetAgent]);

  // §10 — "Try again" handler. Re-issues the last user turn on the
  // *same* session_id (sessionIdRef stays intact across retries) so
  // the server-side history is preserved and the agent loop simply
  // gets another iteration. Spec explicitly forbids re-POSTing only
  // the failed tool result or auto-retrying without user input.
  const handleRetry = useCallback(() => {
    const lastMessage = lastUserMessageRef.current;
    if (!lastMessage) {
      // No prior message captured — nothing to retry. Clear the error
      // so the user is not stuck staring at a dead button.
      setRetryableError(null);
      return;
    }
    setRetryableError(null);
    void sendTextMessage(lastMessage);
  }, [sendTextMessage]);

  const chatMessages = messages;

  const blurViewOpacity = scrollY.interpolate({
    inputRange: [50, 150],
    outputRange: [1, 0.4],
    extrapolate: "clamp",
  });

  const chatContentContainerStyle = useMemo(
    () => ({
      paddingBottom: 50 + keyboardHeight,
      paddingTop: 45,
      flexGrow: 1,
      justifyContent: chatMessages.length === 0 ? "center" : "flex-start",
    }),
    [chatMessages.length, keyboardHeight],
  );

  const handleAddToolResult = useCallback(
    (toolCallId: string, output: unknown) => {
      const decision = toolDecisionsRef.current.get(toolCallId);
      if (!decision) return;
      const userDecision =
        output && typeof output === "object" && "user_decision" in output
          ? (output as { user_decision?: string }).user_decision
          : undefined;
      if (userDecision === "rejected") {
        decision.onDismiss();
      } else {
        decision.onConfirm();
      }
    },
    [],
  );

  const renderChatMessage = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => {
      const isUser = item.role === "user";
      const mode = resolveMode(item, streamingMessageId);

      if (isUser) {
        const userText = getMessageText(item);
        return (
          <View className="w-full mb-4 z-0 items-end">
            <View className="bg-light-primary-red max-w-[85%] rounded-3xl px-4 py-3">
              <Text className="text-sm leading-5 text-white">{userText}</Text>
            </View>
          </View>
        );
      }

      return (
        <View className="w-full mb-4 z-0 items-start">
          <MessageContent
            message={item}
            mode={mode}
            addToolResult={handleAddToolResult}
            onUserPrompt={sendTextMessage}
          />
        </View>
      );
    },
    [streamingMessageId, handleAddToolResult, sendTextMessage],
  );

  const isLoading = isStreaming;

  const listFooterComponent = useMemo(() => {
    const hasRetryableError = retryableError !== null;
    const hasNonRetryableError = nonRetryableError !== null;
    if (!isLoading && !hasRetryableError && !hasNonRetryableError) {
      return null;
    }

    // Note: PreviewCard and PendingTxCard used to render here as a
    // footer side-channel. They now render inline as `tool` parts on
    // the assistant message via the StructuredUI registry
    // (generative-ui-spec §4.3), so new user turns stack below them
    // correctly.
    return (
      <View className="gap-2">
        {isLoading && (
          <View className="self-start mt-2 bg-white/80 border border-light-primary-red/10 rounded-3xl px-4 py-2 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#c71c4b" />
            <Text className="text-xs text-light-matte-black">
              {currentStatus ?? "Takumi is thinking..."}
            </Text>
          </View>
        )}

        {hasRetryableError && retryableError ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`${retryableError}. Try again button available.`}
            className="my-1.5 rounded-2xl border border-light-primary-red/30 bg-light-primary-red/5 px-3.5 py-3"
          >
            <View className="flex-row items-start gap-2">
              <AlertTriangle size={16} color="#c71c4b" />
              <Text
                className="flex-1 text-sm text-light-matte-black leading-5"
                numberOfLines={0}
              >
                {retryableError}
              </Text>
            </View>
            <View className="flex-row mt-2.5">
              <Pressable
                onPress={handleRetry}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-light-primary-red px-3 py-2 active:opacity-80"
              >
                <RotateCcw size={14} color="#ffffff" />
                <Text className="text-xs font-semibold text-white text-center">
                  Try again
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {hasNonRetryableError && nonRetryableError ? (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLabel={`${nonRetryableError}. Start new conversation button available.`}
            className="my-1.5 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3"
          >
            <View className="flex-row items-start gap-2">
              <AlertTriangle size={16} color="#6b7280" />
              <Text
                className="flex-1 text-sm text-light-matte-black leading-5"
                numberOfLines={0}
              >
                {nonRetryableError}
              </Text>
            </View>
            <View className="flex-row mt-2.5">
              <Pressable
                onPress={handleNewConversation}
                accessibilityRole="button"
                accessibilityLabel="Start new conversation"
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 active:opacity-70"
              >
                <SquarePen size={14} color="#c71c4b" />
                <Text className="text-xs font-semibold text-light-matte-black text-center">
                  New conversation
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    );
  }, [
    isLoading,
    currentStatus,
    retryableError,
    nonRetryableError,
    handleRetry,
    handleNewConversation,
  ]);

  // ── Approval sheet handlers ───────────────────────────────────────
  const approvalGrantOptions = useMemo(() => {
    if (!approvalState) return [];
    return buildGrantOptions(
      sessionIdRef.current ?? "no-session",
      approvalState.payload.name,
    );
  }, [approvalState]);

  const handleApprovalApprove = useCallback(
    (choice: GrantChoice) => {
      if (!approvalState) return;
      const activeAddress = connectedWallet?.address;
      // Persist grant (unless the user picked "once") so the next
      // invocation inherits the delegation per §6.
      if (
        choice.lifetime.type !== "once" &&
        activeAddress &&
        grantStoreRef.current?.store
      ) {
        grantStoreRef.current.store.add({
          scope: choice.scope,
          lifetime: choice.lifetime,
          wallet_address: activeAddress,
          granted_at: Date.now(),
        });
      }
      approvalState.onApprove();
    },
    [approvalState, connectedWallet?.address],
  );

  const handleApprovalReject = useCallback(() => {
    approvalState?.onReject();
  }, [approvalState]);

  return (
    <GestureHandlerRootView className="flex-1">
      <KeyboardProvider>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="flex-1 bg-light-main-container"
        >
          <View style={{ width: screenWidth }}>
            <ConversationHistory
              onScrollToChat={handleScrollToChat}
              onResumeConversation={resumeConversation}
            />
          </View>

          <View
            style={{ width: screenWidth }}
            className="flex-1 bg-light-main-container relative"
          >
            <View className="flex-row justify-between z-50 px-4 absolute top-0 left-0 w-full">
              <BlurView
                intensity={20}
                experimentalBlurMethod="dimezisBlurView"
                className="overflow-hidden rounded-full"
              >
                <Animated.View
                  style={{ opacity: blurViewOpacity }}
                  className="absolute bg-light w-full h-full left-0 right-0 rounded-full"
                >
                  <View />
                </Animated.View>
                <TouchableOpacity
                  onPress={handleScrollToHistory}
                  className="p-4 aspect-square rounded-full gap-[4px] relative w-[38px]"
                >
                  <View className="border border-light-primary-red w-[15px] absolute top-[15px] rounded-full left-[12px]" />
                  <View className="border border-light-primary-red w-[10px] absolute top-[21px] rounded-full left-[12px]" />
                </TouchableOpacity>
              </BlurView>
              <BlurView
                intensity={20}
                experimentalBlurMethod="dimezisBlurView"
                className="overflow-hidden rounded-full"
              >
                <Animated.View
                  style={{
                    opacity: blurViewOpacity,
                  }}
                  className="absolute bg-white w-full h-full left-0 right-0 rounded-full"
                >
                  <View />
                </Animated.View>
                <View className="px-4 pt-3 rounded-full">
                  <Text className="font-semibold text-light-matte-black/80">
                    Takumi Agent
                  </Text>
                </View>
              </BlurView>
              <BlurView
                intensity={20}
                experimentalBlurMethod="dimezisBlurView"
                className="overflow-hidden rounded-full"
              >
                <Animated.View
                  style={{
                    opacity: blurViewOpacity,
                  }}
                  className="absolute bg-light w-full h-full left-0 right-0 rounded-full"
                >
                  <View />
                </Animated.View>
                <TouchableOpacity
                  onPress={handleNewConversation}
                  className="p-[10px] rounded-full"
                >
                  <SquarePen size={20} color="#c71c4b" />
                </TouchableOpacity>
              </BlurView>
            </View>

            <View className="flex-1">
              <View className="flex-1 px-4">
                <FlashList
                  ref={chatListRef}
                  data={chatMessages}
                  renderItem={renderChatMessage}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={chatContentContainerStyle as ViewStyle}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="none"
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false },
                  )}
                  onScrollBeginDrag={handleUserScrollBeginDrag}
                  scrollEventThrottle={16}
                  ListEmptyComponent={
                    <View className="items-center px-4">
                      <Text className="text-sm text-light-matte-black/70 text-center mt-3">
                        Welcome to Takumi Agent!
                      </Text>
                    </View>
                  }
                  ListFooterComponent={listFooterComponent}
                />
              </View>

              {chatMessages.length === 0 && (
                <QuickPrompts onSelectPrompt={handlePromptSelect} />
              )}

              <ChatInput
                value={input}
                onChangeText={handleInputChange}
                onSend={handleSend}
                isLoading={isLoading}
                onCancel={stopAgent}
                placeholder="Ask me anything..."
              />
            </View>
          </View>
        </ScrollView>

        {approvalState ? (
          <ApprovalSheet
            title={approvalState.payload.name}
            summary={approvalState.payload.meta.human_summary}
            warning={specialWarning(approvalState.payload.name)}
            grantOptions={approvalGrantOptions}
            onApprove={handleApprovalApprove}
            onReject={handleApprovalReject}
          />
        ) : null}

        {!isOnboardingLoading && (
          <AgentOnboarding
            visible={shouldShowOnboarding}
            onComplete={completeOnboarding}
          />
        )}
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
