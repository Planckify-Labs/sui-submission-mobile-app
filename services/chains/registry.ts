import type { ChainAdapter, Namespace } from "./types";

const adapters = new Map<Namespace, ChainAdapter>();

export const ChainAdapterRegistry = {
  register(adapter: ChainAdapter): void {
    adapters.set(adapter.namespace, adapter);
  },
  get(namespace: Namespace): ChainAdapter | null {
    return adapters.get(namespace) ?? null;
  },
  list(): ChainAdapter[] {
    return Array.from(adapters.values());
  },
  clear(): void {
    adapters.clear();
  },
};
