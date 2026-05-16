/**
 * Node ESM resolution hook for `EvmWalletKit.test.ts`.
 *
 * See `_test-resolver.mjs` for registration. This file implements the
 * hook body. NO kit logic here.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ../../../ relative to this file = mobile-app root
const PROJECT_ROOT = resolvePath(__dirname, "..", "..", "..");

// Minimum-viable stubs for RN / Expo modules reachable only through the
// preserved `services/walletService.ts` dwell sites. The kit never
// exercises these paths under this test.
const STUB_SOURCES = {
  "expo-secure-store": `
    export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "whenUnlockedThisDeviceOnly";
    export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = "afterFirstUnlockThisDeviceOnly";
    export async function getItemAsync() { return null; }
    export async function setItemAsync() {}
    export async function deleteItemAsync() {}
    export default {};
  `,
  "mmkv-storage": `
    export const storage = {
      getString: () => undefined,
      set: () => {},
      delete: () => {},
    };
  `,
};

function stubUrl(src) {
  return "data:text/javascript;base64," + Buffer.from(src).toString("base64");
}

function tryExtensions(absNoExt) {
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    const candidate = absNoExt + ext;
    if (existsSync(candidate)) return candidate;
  }
  if (existsSync(absNoExt) && statSync(absNoExt).isDirectory()) {
    for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
      const candidate = resolvePath(absNoExt, "index" + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // Stub expo-secure-store.
  if (specifier === "expo-secure-store") {
    return {
      shortCircuit: true,
      url: stubUrl(STUB_SOURCES["expo-secure-store"]),
      format: "module",
    };
  }
  // Stub the mmkv storage helper (`@/lib/storage/mmkv`).
  if (specifier === "@/lib/storage/mmkv") {
    return {
      shortCircuit: true,
      url: stubUrl(STUB_SOURCES["mmkv-storage"]),
      format: "module",
    };
  }

  // Alias rewrite for `@/*`.
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const abs = resolvePath(PROJECT_ROOT, rel);
    const withExt =
      existsSync(abs) && statSync(abs).isFile() ? abs : tryExtensions(abs);
    if (withExt) {
      return nextResolve(pathToFileURL(withExt).href, context);
    }
  }

  // Relative imports missing an explicit extension.
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[a-zA-Z0-9]+$/.test(specifier) &&
    context.parentURL
  ) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const abs = resolvePath(parentDir, specifier);
    const withExt = tryExtensions(abs);
    if (withExt) {
      return nextResolve(pathToFileURL(withExt).href, context);
    }
  }

  return nextResolve(specifier, context);
}

/**
 * Load hook: surgically rewrites a short list of hot-spot files whose
 * import style ("plain" named imports of types like `import { TWallet }`)
 * confuses Node's strip-types runner. We only touch files on the kit's
 * transitive load path — this is test-harness plumbing, not a
 * modification of the original source on disk. The original files
 * remain byte-identical in the working tree; Task 05's "no edits" rule
 * is preserved.
 */
const SOURCE_REWRITES = {
  "utils/walletUtils.ts": (src) =>
    src.replace(
      /^import\s*\{\s*TWallet\s*,\s*TWalletCreationParams\s*\}\s*from\s*"@\/constants\/types\/walletTypes";/m,
      `import type { TWallet, TWalletCreationParams } from "@/constants/types/walletTypes";`,
    ),
  "utils/clients.ts": (src) =>
    src.replace(
      /^import\s*\{\s*([\s\S]*?)\s*\}\s*from\s*"viem";/m,
      (_match, inner) => {
        // viem's `Account` / `Chain` are types; the rest (createPublicClient,
        // createWalletClient, http) are runtime. Split them so Node's
        // strip-types doesn't try to bind types at runtime.
        const names = inner
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        const typeNames = names.filter((n) => /^[A-Z]/.test(n));
        const valueNames = names.filter((n) => !/^[A-Z]/.test(n));
        const lines = [];
        if (valueNames.length) {
          lines.push(`import { ${valueNames.join(", ")} } from "viem";`);
        }
        if (typeNames.length) {
          lines.push(`import type { ${typeNames.join(", ")} } from "viem";`);
        }
        return lines.join("\n");
      },
    ),
  "services/walletService.ts": (src) =>
    src.replace(
      /^import\s*\{\s*TWallet\s*\}\s*from\s*"@\/constants\/types\/walletTypes";/m,
      `import type { TWallet } from "@/constants/types/walletTypes";`,
    ),
};

export async function load(url, context, nextLoad) {
  if (url.startsWith("file://")) {
    const absPath = fileURLToPath(url);

    // JSON imports — Metro/RN supports these natively without an import
    // attribute, but Node's ESM loader requires `with { type: "json" }`.
    // Surface JSON files as ESM modules that re-export the parsed object
    // as the default export, matching Metro's behaviour.
    if (absPath.endsWith(".json")) {
      const raw = readFileSync(absPath, "utf8");
      const source = `export default ${raw};`;
      return {
        format: "module",
        shortCircuit: true,
        source,
      };
    }

    for (const [suffix, rewrite] of Object.entries(SOURCE_REWRITES)) {
      if (absPath.endsWith(suffix.replaceAll("/", sep))) {
        const raw = readFileSync(absPath, "utf8");
        const rewritten = rewrite(raw);
        const stripped = stripTypeScriptTypes(rewritten, {
          mode: "strip",
          sourceUrl: url,
        });
        return {
          format: "module",
          shortCircuit: true,
          source: stripped,
        };
      }
    }
  }
  return nextLoad(url, context);
}
