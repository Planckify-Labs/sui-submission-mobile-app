/**
 * Hook: capture + compress + upload a QRIS sticker photo on the
 * merchant onboarding "Scan my QRIS" path (spec §1.1.1 step 2,
 * §12 Q9 evidence archive, milestone M1).
 *
 * Why this hook exists
 * --------------------
 * First-claim-wins on `qrisPan` (§12 Q9) only stays dispute-safe if
 * ops can later verify "did the claimer actually hold the sticker?"
 * A compressed still of the sticker is that lightweight evidence —
 * it is NOT a KYC document (no NIK, no selfie) and NOT the QR pixel
 * itself. Copy-audience rule (spec §1.1): merchants are non-crypto
 * users, so visible strings here only reference "sticker photo" —
 * never "QR pixel" / "image payload" / anything technical.
 *
 * Three-role separation (memory `feedback_role_separation.md`)
 * ------------------------------------------------------------
 *   user   → captures the photo (camera or gallery)
 *   server → stores the evidence blob, returns `stickerPhotoKey`
 *   wallet → not involved. No signing, no keys.
 *
 * Compression budget (non-negotiable)
 * -----------------------------------
 * - Longest edge ≤ 1600 px, then ≤ 1024 px fallback.
 * - JPEG quality starts at 0.8, decrements 0.1 per attempt.
 * - Final file size MUST be ≤ 200 KB before upload. Raw camera
 *   frames are 3–8 MB on modern Android devices and would break
 *   onboarding on mediocre 3G.
 *
 * Persistence rule (§12 Q9)
 * -------------------------
 * base64 is held in memory only until `stickerPhotoKey` is returned
 * from the backend; it is never written to AsyncStorage / MMKV /
 * SecureStore. Caller should discard the object after the form
 * submit on task 12.
 */

import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useCallback } from "react";
import {
  getAccessToken,
  getAccessTokenForWallet,
  getAuthenticatedWalletAddress,
} from "@/hooks/queries/useAuth";
import { storage } from "@/lib/storage/mmkv";
import * as walletService from "@/services/walletService";

const MAX_BYTES = 200 * 1024; // 200 KB JPEG ceiling (spec §11.1)
const PRIMARY_LONGEST_EDGE_PX = 1600;
const FALLBACK_LONGEST_EDGE_PX = 1024;
const QUALITY_START = 0.8;
const QUALITY_FLOOR = 0.4; // below this we fall back to 1024 px
const QUALITY_STEP = 0.1;

/**
 * Thrown when the backend upload (`POST /v1/uploads/merchant-sticker`)
 * fails — either the endpoint is not yet deployed (M1 backend is
 * task 27/45, so 404 is tolerated during M1) or the network call
 * itself errored. Callers should surface a retry toast but MUST NOT
 * block signup submission: the task 12 form accepts an undefined
 * `stickerPhotoKey` and the merchant record is still valid without
 * the evidence blob (it just carries a small dispute-risk penalty).
 */
export class UploadFailedError extends Error {
  public readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "UploadFailedError";
    this.status = status;
  }
}

/**
 * Thrown when the user denies camera/gallery permission. UI should
 * offer the alternate capture path ("Try camera again" if the
 * gallery is denied, etc.).
 */
export class CapturePermissionDeniedError extends Error {
  public readonly source: "camera" | "library";
  constructor(source: "camera" | "library") {
    super(`${source} permission denied`);
    this.name = "CapturePermissionDeniedError";
    this.source = source;
  }
}

/**
 * Thrown when the picker was launched but the user dismissed the
 * sheet without selecting/capturing an image. Not an error path per
 * se — the caller typically re-prompts or abandons the photo attach.
 */
export class CaptureCanceledError extends Error {
  constructor() {
    super("capture canceled");
    this.name = "CaptureCanceledError";
  }
}

type TCaptureResult = { uri: string; base64: string };
type TCompressResult = { uri: string; base64: string; bytes: number };
type TUploadResult = { stickerPhotoKey: string };

/**
 * Pick the best longest-edge resize action for the given image.
 * Only resizes if the source exceeds `targetLongest`; otherwise we
 * pass an empty action list so the manipulator just re-encodes.
 */
function resizeAction(
  srcWidth: number,
  srcHeight: number,
  targetLongest: number,
): ImageManipulator.Action[] {
  const longest = Math.max(srcWidth, srcHeight);
  if (longest <= targetLongest) return [];
  if (srcWidth >= srcHeight) {
    return [{ resize: { width: targetLongest } }];
  }
  return [{ resize: { height: targetLongest } }];
}

/**
 * Probe the byte size of a local file URI via `expo-file-system`'s
 * `File` API. Returns `0` on failure rather than throwing — the
 * caller's MAX_BYTES comparison naturally rejects unreadable files
 * and we don't want to mask a compression bug as a permission bug.
 */
function fileBytes(uri: string): number {
  try {
    const f = new FileSystem.File(uri);
    return f.size ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Compress a local image URI to ≤ 200 KB JPEG.
 *
 * Algorithm (spec §11.1 compression rules):
 *   1. Resize longest edge to 1600 px (if source is larger).
 *   2. Re-encode at JPEG quality 0.8, check size.
 *   3. If > 200 KB, drop quality by 0.1 and retry (down to 0.4).
 *   4. If still > 200 KB at 0.4, fall back to 1024 px longest edge
 *      and repeat quality loop from 0.8 down to 0.4.
 *   5. Return the last attempt regardless — caller can still upload;
 *      the backend (task 27) may tighten a hard reject on its side
 *      but at M1 we log and proceed.
 */
async function compressImage(uri: string): Promise<TCompressResult> {
  // Probe dimensions cheaply by running a no-op manipulate. The
  // manipulator returns `width`/`height` for the source after load.
  const probe = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const tryBudget = async (
    targetLongest: number,
  ): Promise<TCompressResult | null> => {
    const actions = resizeAction(probe.width, probe.height, targetLongest);
    for (
      let q = QUALITY_START;
      q >= QUALITY_FLOOR - 1e-6;
      q = Number((q - QUALITY_STEP).toFixed(2))
    ) {
      const out = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: q,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      const bytes = fileBytes(out.uri);
      if (bytes > 0 && bytes <= MAX_BYTES) {
        return { uri: out.uri, base64: out.base64 ?? "", bytes };
      }
    }
    return null;
  };

  const primary = await tryBudget(PRIMARY_LONGEST_EDGE_PX);
  if (primary) return primary;

  const fallback = await tryBudget(FALLBACK_LONGEST_EDGE_PX);
  if (fallback) return fallback;

  // Last-resort: return the smallest attempt we can produce (1024 px
  // at QUALITY_FLOOR) even if > 200 KB. Caller decides whether to
  // upload a too-large file; at M1 we still attach it and log.
  const lastResort = await ImageManipulator.manipulateAsync(
    uri,
    resizeAction(probe.width, probe.height, FALLBACK_LONGEST_EDGE_PX),
    {
      compress: QUALITY_FLOOR,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  const bytes = fileBytes(lastResort.uri);
  console.warn(
    `[useCaptureStickerPhoto] compression over budget: ${bytes} bytes ` +
      "(budget 204800). Uploading anyway — backend may reject.",
  );
  return { uri: lastResort.uri, base64: lastResort.base64 ?? "", bytes };
}

/**
 * Resolve an access token for the currently active wallet, mirroring
 * the lookup order used by `api` in `constants/configs/ky.ts`. We do
 * not reuse the `api` ky instance here because it is JSON-only and
 * throws on missing auth; the upload endpoint is multipart and the
 * merchant may not yet be signed in during onboarding (in which case
 * we degrade to an unauthenticated POST — backend task 45 will
 * decide whether unauthenticated stickers are accepted in M1).
 */
async function resolveAccessToken(): Promise<string | null> {
  try {
    const indexStr = storage.getString("active_wallet_index");
    const idx = indexStr ? parseInt(indexStr, 10) : 0;
    const wallets = await walletService.loadWalletsFromStorage();
    const activeAddr = wallets?.[idx]?.address?.toLowerCase() || null;

    let token: string | null = null;
    if (activeAddr) token = await getAccessTokenForWallet(activeAddr);
    if (!token) {
      const authed = (await getAuthenticatedWalletAddress())?.toLowerCase();
      if (authed && authed === activeAddr) token = await getAccessToken();
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * POST the compressed sticker image as multipart/form-data to
 * `/v1/uploads/merchant-sticker`. The backend (task 45) will respond
 * with `{ stickerPhotoKey: string }`. During M1 before the backend
 * lands, the endpoint will 404 and we throw `UploadFailedError` —
 * the caller handles this gracefully and proceeds without a key.
 */
async function uploadSticker(uri: string): Promise<TUploadResult> {
  const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.EXPO_PUBLIC_API_KEY;
  if (!base) {
    throw new UploadFailedError("EXPO_PUBLIC_API_URL not configured");
  }

  const token = await resolveAccessToken();

  // React Native's FormData accepts the `{ uri, name, type }` shape
  // directly — fetch sends it as a proper multipart/form-data part
  // without us needing to read the file into memory first.
  const form = new FormData();
  form.append("file", {
    // biome-ignore lint/suspicious/noExplicitAny: RN FormData file shape is non-standard
    uri,
    name: "sticker.jpg",
    type: "image/jpeg",
    // biome-ignore lint/suspicious/noExplicitAny: RN FormData file shape is non-standard
  } as any);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  // Note: DO NOT set Content-Type here. Fetch + FormData on RN
  // computes the multipart boundary automatically; setting it
  // manually breaks the boundary and the server rejects the body.

  let response: Response;
  try {
    response = await fetch(`${base}/v1/uploads/merchant-sticker`, {
      method: "POST",
      headers,
      body: form,
    });
  } catch (err) {
    throw new UploadFailedError(
      `network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new UploadFailedError(
      `upload rejected with ${response.status}`,
      response.status,
    );
  }

  const parsed = (await response.json()) as { stickerPhotoKey?: string };
  if (!parsed.stickerPhotoKey) {
    throw new UploadFailedError("backend response missing stickerPhotoKey");
  }
  return { stickerPhotoKey: parsed.stickerPhotoKey };
}

/**
 * Public hook. Returns four stable callbacks:
 *   - `captureFromCamera()` — requests camera permission, launches
 *     the system camera, returns `{ uri, base64 }` of the RAW
 *     capture. DO NOT upload raw; always run `compress()` first.
 *   - `captureFromLibrary()` — gallery fallback, same return shape.
 *   - `compress(uri)` — returns a ≤ 200 KB JPEG at `{ uri, base64,
 *     bytes }`. Logs a warning if the budget could not be hit.
 *   - `upload({ uri })` — posts to the backend and returns
 *     `{ stickerPhotoKey }`. Throws `UploadFailedError` on failure.
 */
export function useCaptureStickerPhoto() {
  const captureFromCamera = useCallback(async (): Promise<TCaptureResult> => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      throw new CapturePermissionDeniedError("camera");
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      // No editing: this is evidence capture, not styling.
      allowsEditing: false,
      // High source quality — we'll compress deterministically
      // afterwards. Letting the picker compress would couple our
      // 200 KB budget to a device-specific quality value.
      quality: 1,
      base64: true,
      cameraType: ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets?.[0]) {
      throw new CaptureCanceledError();
    }
    const asset = result.assets[0];
    return { uri: asset.uri, base64: asset.base64 ?? "" };
  }, []);

  const captureFromLibrary = useCallback(async (): Promise<TCaptureResult> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      throw new CapturePermissionDeniedError("library");
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 1,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) {
      throw new CaptureCanceledError();
    }
    const asset = result.assets[0];
    return { uri: asset.uri, base64: asset.base64 ?? "" };
  }, []);

  const compress = useCallback(
    (uri: string): Promise<TCompressResult> => compressImage(uri),
    [],
  );

  const upload = useCallback(
    (args: { uri: string }): Promise<TUploadResult> => uploadSticker(args.uri),
    [],
  );

  return { captureFromCamera, captureFromLibrary, compress, upload };
}
