/**
 * `<DefiError>` — single presentational surface for every DeFi
 * strategy-flow error.
 *
 * Spec: docs/defi-strategies-spec.md §16. Mirrors `<PaymentError>`:
 * curated copy only, dev-only raw detail, semantic CTA prop.
 */

import {
  AlertTriangle,
  RefreshCw,
  Settings,
  Wallet,
  XCircle,
} from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";
import {
  type DefiErrorCode,
  defiErrorCopy,
} from "@/services/defi/errors/defiErrors";

export interface DefiErrorProps {
  code: DefiErrorCode;
  /** Dev-only raw context. Never sent to telemetry; only rendered when __DEV__. */
  devMessage?: string;
  onRetry?: () => void;
  onReview?: () => void;
  onConfigure?: () => void;
  onTopUp?: () => void;
}

const ICONS = {
  retry: RefreshCw,
  review: AlertTriangle,
  configure: Settings,
  topup: Wallet,
  wait: AlertTriangle,
} as const;

export function DefiError({
  code,
  devMessage,
  onRetry,
  onReview,
  onConfigure,
  onTopUp,
}: DefiErrorProps) {
  const copy = defiErrorCopy[code];
  const Icon = copy.cta ? (ICONS[copy.cta] ?? XCircle) : XCircle;
  const handler = resolveHandler(copy.cta, {
    onRetry,
    onReview,
    onConfigure,
    onTopUp,
  });
  const ctaLabel =
    copy.cta === "retry"
      ? "Try again"
      : copy.cta === "configure"
        ? "Open settings"
        : copy.cta === "review"
          ? "Review"
          : copy.cta === "topup"
            ? "Add funds"
            : copy.cta === "wait"
              ? "OK"
              : undefined;

  return (
    <View className="bg-light rounded-3xl p-6 shadow-md-">
      <View className="items-center mb-4">
        <View className="w-14 h-14 bg-light-primary-red/10 rounded-full items-center justify-center mb-2">
          <Icon color="#c71c4b" size={32} />
        </View>
        <Text className="text-light-matte-black font-bold text-xl">
          {copy.title}
        </Text>
        <Text className="text-light-matte-black/60 text-sm text-center mt-1">
          {copy.body}
        </Text>
      </View>

      {__DEV__ && devMessage ? (
        <View className="bg-light-main-container rounded-xl p-3 mt-2">
          <Text className="text-light-matte-black/50 text-xs mb-1">Dev</Text>
          <Text className="text-light-matte-black font-mono text-xs" selectable>
            {devMessage}
          </Text>
        </View>
      ) : null}

      {ctaLabel && handler ? (
        <TouchableOpacity
          onPress={handler}
          className="bg-light-matte-black rounded-2xl py-3 items-center mt-4"
        >
          <Text className="text-light font-semibold">{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type Handler = (() => void) | undefined;
function resolveHandler(
  action: DefiErrorCopy["cta"],
  handlers: {
    onRetry: Handler;
    onReview: Handler;
    onConfigure: Handler;
    onTopUp: Handler;
  },
): Handler {
  switch (action) {
    case "retry":
      return handlers.onRetry;
    case "review":
      return handlers.onReview;
    case "configure":
      return handlers.onConfigure;
    case "topup":
      return handlers.onTopUp;
    default:
      return undefined;
  }
}

type DefiErrorCopy = (typeof defiErrorCopy)[DefiErrorCode];
