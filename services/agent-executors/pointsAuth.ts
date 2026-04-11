/**
 * Points authentication state helper.
 *
 * Centralises the "does this wallet currently have a valid JWT for the
 * points / redemption API?" check used in two places:
 *
 *  1. The `wallet_context.points_authenticated` field that the mobile
 *     sends on every `POST /chat` request — see `AgentMode.tsx`. The
 *     server reads it so the agent knows whether to call
 *     `request_authentication` before any auth-required points tool.
 *  2. The `request_authentication` executor itself — after it kicks
 *     the user through the login sheet, the executor polls
 *     `checkPointsAuth` to detect when the login has succeeded.
 *
 * The check is LOCAL ONLY — it reads from `expo-secure-store` and
 * does not hit the network. A "local pass" does not guarantee the
 * token hasn't been revoked server-side; the individual points
 * executors are responsible for handling a 401 via the 401 redirect
 * hook in `constants/configs/ky.ts` and classifying it as
 * `authentication_required` so the agent can retry.
 *
 * We deliberately do NOT decode the JWT payload here to check `exp`.
 * Expo-secure-store is not a JWT library, and a decoded-but-expired
 * token is functionally equivalent to no token at all — the 401
 * path handles it. The presence of an access token is a sufficient
 * signal for the agent's UX-level "should I skip the login prompt?"
 * decision.
 */

import { getAccessTokenForWallet } from "@/hooks/queries/useAuth";

/**
 * Returns true if the given wallet address has an access token stored
 * for the points / redemption API.
 *
 * @param walletAddress The 0x-prefixed wallet address. Lower/upper
 *                      case is handled by the underlying key helper.
 *                      An empty / undefined address returns false.
 */
export async function checkPointsAuth(
  walletAddress: string | undefined | null,
): Promise<boolean> {
  if (!walletAddress) return false;
  try {
    const token = await getAccessTokenForWallet(walletAddress);
    return !!token;
  } catch {
    // SecureStore failure — fail closed so the agent surfaces the
    // login prompt rather than silently assuming the user is
    // authenticated.
    return false;
  }
}
