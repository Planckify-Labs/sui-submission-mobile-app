import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
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
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import ApprovalSheet, {
  buildGrantOptions,
  type GrantChoice,
  specialWarning,
} from "@/components/agent/ApprovalSheet";
import { useAgentOnboarding } from "@/hooks/useAgentOnboarding";
import { useBlockchainsWithStorage } from "@/hooks/useBlockchainsWithStorage";
import { usePendingTxCards } from "@/hooks/usePendingTxCards";
import { useWallet } from "@/hooks/useWallet";
import {
  assertRegistryParity,
  type ExecutorContext,
} from "@/services/agent-executors";
import { checkPointsAuth } from "@/services/agent-executors/pointsAuth";
import {
  type AgentSession,
  type AgentSessionUIBindings,
  createAgentSession,
  type ToolPendingPayload,
  type WalletContext,
} from "@/services/agentSession";
import { PermissionGrantStore } from "@/services/permissionGrantStore";
import {
  type ConnectedWallet,
  HOT_WALLET_POLICY,
} from "@/services/resolveUxTreatment";
import * as walletService from "@/services/walletService";
import AgentOnboarding from "./AgentModeOnboarding/AgentOnboarding";
import ChatInput from "./ChatInput";
import ConversationHistory from "./ConversationHistory";
import MarkdownMessage from "./MarkdownMessage";
import { PendingTxCard } from "./PendingTxCard";
import PreviewCard from "./PreviewCard/PreviewCard";
import QuickPrompts from "./QuickPrompts";

const { width: screenWidth } = Dimensions.get("window");

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

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

  // ConnectedWallet — plumbed into `resolveUxTreatment` via the session.
  const connectedWallet: ConnectedWallet | null = useMemo(() => {
    const address = activeWallet?.address as `0x${string}` | undefined;
    if (!address || !grantStore) return null;
    return {
      address,
      approvalPolicy: HOT_WALLET_POLICY,
      grantStore,
    };
  }, [activeWallet?.address, grantStore]);

  // Executor context — forwarded to every mobile tool call.
  // `activeChainId` is the fallback the executors use when the agent
  // drops `chain_id` from a tool input (the server's mobile-tool
  // schema is a permissive `{}` stub, so the LLM is not schema-bound
  // to always include it).
  const executorContext: ExecutorContext | null = useMemo(() => {
    if (!activeWallet?.address) return null;
    const account = walletService.getAccountForWallet(activeWallet);
    return {
      wallet: activeWallet,
      account: account ?? null,
      blockchains,
      activeChainId: activeChain?.chain.id,
    };
  }, [activeWallet, blockchains, activeChain?.chain.id]);

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
  // have an active wallet / chain resolved.
  const walletContext: WalletContext | null = useMemo(() => {
    const address = activeWallet?.address as `0x${string}` | undefined;
    if (!address || !activeChain?.chain) return null;
    return {
      address,
      chain_id: activeChain.chain.id,
      chain_name: activeChain.chain.name,
      chain_symbol: activeChain.chain.nativeCurrency.symbol,
      label: activeWallet?.name,
      points_authenticated: pointsAuthenticated,
    };
  }, [activeWallet, activeChain, pointsAuthenticated]);

  const chatListRef = useRef<any>(null);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: screenWidth, animated: false });
    }, 0);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      chatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    return () => clearTimeout(timeout);
  }, []);

  // Tear down any in-flight session when the screen unmounts.
  useEffect(() => {
    return () => {
      activeSessionRef.current?.stop();
      activeSessionRef.current = null;
    };
  }, []);

  const handleScrollToChat = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: screenWidth, animated: true });
  }, []);

  const handleScrollToHistory = useCallback(() => {
    scrollViewRef.current?.scrollTo({ x: 0, animated: true });
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
  }, []);

  // ── UI bindings the session dispatches into ──────────────────────
  // These are re-created on every turn so they capture the current
  // assistant message id and dispatch into React state. The session
  // holds the callbacks for its lifetime, so this is safe.
  const buildUiBindings = useCallback(
    (assistantMessageId: string): AgentSessionUIBindings => ({
      appendText: (delta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId ? { ...m, text: m.text + delta } : m,
          ),
        );
        setCurrentStatus(null);
      },
      showStatus: (message) => {
        setCurrentStatus(message);
      },
      showPreviewCard: (payload, onConfirm, onDismiss) => {
        setCurrentStatus(null);
        setInlinePreview({
          payload,
          onConfirm: () => {
            setInlinePreview((current) =>
              current?.payload.tool_call_id === payload.tool_call_id
                ? null
                : current,
            );
            void onConfirm();
          },
          onDismiss: () => {
            setInlinePreview((current) =>
              current?.payload.tool_call_id === payload.tool_call_id
                ? null
                : current,
            );
            void onDismiss();
          },
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
      },
      done: () => {
        setCurrentStatus(null);
        setIsStreaming(false);
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
    [],
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

      // Close any prior session first — a new turn opens its own stream.
      activeSessionRef.current?.stop();
      activeSessionRef.current = null;

      // §10 — a successful new send invalidates any stale error state
      // from a previous failed turn. Track the message so a future
      // "Try again" tap can re-issue it on the same session_id.
      lastUserMessageRef.current = trimmed;
      setRetryableError(null);
      setNonRetryableError(null);

      const userMessage: ChatMessage = {
        id: genId(),
        role: "user",
        text: trimmed,
      };
      const assistantMessage: ChatMessage = {
        id: genId(),
        role: "assistant",
        text: "",
      };
      currentAssistantIdRef.current = assistantMessage.id;
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setCurrentStatus("Thinking…");

      const sessionId = sessionIdRef.current ?? genId();
      sessionIdRef.current = sessionId;

      const session = createAgentSession({
        session_id: sessionId,
        wallet_context: sendWalletContext,
        // Server-side schema accepts `{role, content}` ModelMessages.
        messages: [{ role: "user", content: trimmed }],
        executorContext,
        connectedWallet,
        ui: buildUiBindings(assistantMessage.id),
      });
      activeSessionRef.current = session;

      try {
        await session.start();
      } catch (sendError) {
        console.error("[AgentMode] Failed to stream agent turn", sendError);
        setIsStreaming(false);
        setCurrentStatus(null);
      }
    },
    [
      walletContext,
      connectedWallet,
      executorContext,
      buildUiBindings,
      pointsAuthenticated,
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

  // Reset conversation — new session id on next send.
  const handleNewConversation = useCallback(() => {
    activeSessionRef.current?.stop();
    activeSessionRef.current = null;
    sessionIdRef.current = null;
    currentAssistantIdRef.current = null;
    lastUserMessageRef.current = "";
    setMessages([]);
    setCurrentStatus(null);
    setInlinePreview(null);
    setApprovalState(null);
    setIsStreaming(false);
    setRetryableError(null);
    setNonRetryableError(null);
  }, []);

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
      paddingBottom: 50,
      paddingTop: 45,
      flexGrow: 1,
      justifyContent: chatMessages.length === 0 ? "center" : "flex-start",
    }),
    [chatMessages.length],
  );

  const renderChatMessage = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => {
      const isUser = item.role === "user";

      if (isUser) {
        return (
          <View className="w-full mb-4 z-0 items-end">
            <View className="bg-light-primary-red max-w-[85%] rounded-3xl px-4 py-3">
              <Text className="text-sm leading-5 text-white">{item.text}</Text>
            </View>
          </View>
        );
      }

      return (
        <View className="w-full mb-4 z-0 items-start">
          <View>
            {item.text.length > 0 ? (
              <MarkdownMessage content={item.text} />
            ) : null}
          </View>
        </View>
      );
    },
    [],
  );

  const isLoading = isStreaming;

  // Task 15: pending-tx cards from the agent-session dispatcher.
  // The store is a singleton, so these survive navigation between
  // the agent screen and the rest of the app.
  const pendingTxCards = usePendingTxCards();

  const listFooterComponent = useMemo(() => {
    const hasPreview = inlinePreview !== null;
    const hasRetryableError = retryableError !== null;
    const hasNonRetryableError = nonRetryableError !== null;
    if (
      !isLoading &&
      pendingTxCards.length === 0 &&
      !hasPreview &&
      !hasRetryableError &&
      !hasNonRetryableError
    ) {
      return null;
    }

    return (
      <View className="gap-2">
        {hasPreview && inlinePreview ? (
          <PreviewCard
            key={inlinePreview.payload.tool_call_id}
            summary={inlinePreview.payload.meta.human_summary}
            onConfirm={inlinePreview.onConfirm}
            onDismiss={inlinePreview.onDismiss}
          />
        ) : null}

        {pendingTxCards.length > 0 && (
          <View>
            {pendingTxCards.map((record) => (
              <PendingTxCard key={record.tx_hash} record={record} />
            ))}
          </View>
        )}

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
    pendingTxCards,
    inlinePreview,
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
    <KeyboardProvider>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        className="flex-1 bg-light-main-container"
      >
        <View style={{ width: screenWidth }}>
          <ConversationHistory onScrollToChat={handleScrollToChat} />
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
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                  { useNativeDriver: false },
                )}
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
  );
}
