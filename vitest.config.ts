import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: [
      "services/agent-executors/sui.test.ts",
      "services/chains/solana/takumiPay/pda.test.ts",
      "services/chains/sui/codec.test.ts",
      "services/chains/sui/coinTransferService.test.ts",
      "services/chains/sui/derivation.test.ts",
      "services/chains/sui/errorCodes.transferErrors.test.ts",
      "services/chains/sui/tokenKind.test.ts",
      "services/chains/sui/transferService.test.ts",
      "services/nanopay/solana/__tests__/*.test.ts",
      // Sui Intent Engine (Sui Overflow 2026 Phase 1)
      "services/chains/sui/intent/intentSchema.test.ts",
      "services/chains/sui/intent/intentStore.test.ts",
      "services/chains/sui/intent/compileIntentToPtb.test.ts",
      "services/chains/sui/intent/guardian/guardian.test.ts",
      "services/swap/sui/venueSelector.test.ts",
      "services/swap/sui/appendIntentReceipt.test.ts",
      "services/swap/sui/intentReceiptPackageId.test.ts",
      "services/agent-executors/defi/intentExecutors.test.ts",
      "services/agent-executors/defi/intentSchemaParity.test.ts",
      "services/agent-executors/parseInput.test.ts",
    ],
  },
});
