/**
 * Pick an image from the device gallery and decode a QR code from it.
 *
 * Same raw-string contract as `expo-camera`'s live `onBarcodeScanned`
 * callback — callers feed the returned string straight into
 * `classify(raw)` (payer flow) or `qrisDetector.detect(raw)` (merchant
 * signup flow), with no awareness of whether it came from the live
 * camera feed or a static image.
 *
 * Uses Expo's built-in `Camera.scanFromURLAsync` (no third-party QR
 * decoder dependency). `expo-image-picker` provides the gallery chooser;
 * no compression needed because the decoder reads the image directly.
 */

import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";

/** User dismissed the image picker before selecting. */
export class PickCanceledError extends Error {
  constructor() {
    super("gallery pick canceled");
    this.name = "PickCanceledError";
  }
}

/** User denied photo-library permission. */
export class PickPermissionDeniedError extends Error {
  constructor() {
    super("photo library permission denied");
    this.name = "PickPermissionDeniedError";
  }
}

/** Image was picked but no QR could be decoded from it. */
export class NoQrInImageError extends Error {
  constructor() {
    super("no QR code found in picked image");
    this.name = "NoQrInImageError";
  }
}

/**
 * Open the system image picker and decode the first QR code in the
 * chosen image. Returns the raw decoded string on success. Throws a
 * typed error on each failure mode so call sites can surface copy
 * without relying on error-message string matching.
 */
export async function pickQrFromGallery(): Promise<string> {
  // Android 13+ uses the scoped Photo Picker (no runtime permission).
  // On iOS and older Android, `expo-image-picker` prompts for media
  // library access on first call.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PickPermissionDeniedError();
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: false,
    quality: 1,
    exif: false,
    base64: false,
  });

  if (result.canceled || result.assets.length === 0) {
    throw new PickCanceledError();
  }

  const uri = result.assets[0].uri;

  // `scanFromURLAsync` accepts `file://` paths on both iOS and Android
  // and returns every barcode it can see in the image. We only accept
  // QR codes; the first match wins (QRIS stickers never have more than
  // one QR in frame, but other images might include unrelated codes).
  const matches = await Camera.scanFromURLAsync(uri, ["qr"]);
  if (!matches || matches.length === 0) {
    throw new NoQrInImageError();
  }

  return matches[0].data.trim();
}
