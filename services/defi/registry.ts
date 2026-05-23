import type { Namespace } from "@/services/chains/types";
import type { DefiProtocolAdapter } from "./types";

const adapters = new Map<string, DefiProtocolAdapter>();

export function registerDefiAdapter(a: DefiProtocolAdapter): void {
  adapters.set(a.slug, a);
}

export function getDefiAdapter(slug: string): DefiProtocolAdapter | null {
  return adapters.get(slug) ?? null;
}

export function listDefiAdapters(): DefiProtocolAdapter[] {
  return [...adapters.values()];
}

export function listDefiAdaptersForChain(
  namespace: Namespace,
  chainId: number | string,
): DefiProtocolAdapter[] {
  return [...adapters.values()].filter(
    (a) => a.namespace === namespace && a.chainId === chainId,
  );
}
