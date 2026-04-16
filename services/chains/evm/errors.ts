export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "ProviderRpcError";
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

export const PROVIDER_ERRORS = {
  userRejected: () => new ProviderRpcError(4001, "User rejected the request"),
  unauthorized: () => new ProviderRpcError(4100, "Unauthorized"),
  unsupportedMethod: (m: string) =>
    new ProviderRpcError(4200, `Method ${m} not supported`),
  disconnected: () => new ProviderRpcError(4900, "Disconnected"),
  chainNotConnected: () => new ProviderRpcError(4901, "Chain not connected"),
  chainNotAdded: (id: number) =>
    new ProviderRpcError(4902, `Chain ${id} not added`),
  resourceUnavailable: () =>
    new ProviderRpcError(-32002, "Resource unavailable"),
  invalidParams: (detail: string) =>
    new ProviderRpcError(-32602, `Invalid params: ${detail}`),
  internalError: (detail: string) =>
    new ProviderRpcError(-32603, `Internal error: ${detail}`),
} as const;

export function toRpcErrorPayload(e: unknown): {
  code: number;
  message: string;
  data?: unknown;
} {
  if (e instanceof ProviderRpcError) {
    return { code: e.code, message: e.message, data: e.data };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return { code: -32603, message: msg };
}
