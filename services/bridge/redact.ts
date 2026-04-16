function simpleHashHex(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hi = (h2 >>> 0).toString(16).padStart(8, "0");
  const lo = (h1 >>> 0).toString(16).padStart(8, "0");
  return `${hi}${lo}`;
}

function redactMessage(value: unknown): {
  length: number;
  sha256Prefix: string;
} {
  const str = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return { length: str.length, sha256Prefix: simpleHashHex(str).slice(0, 16) };
}

export function redactParams(method: string, params: unknown): unknown {
  if (!params) return params;
  const paramsArr = Array.isArray(params) ? params : [params];

  if (method === "personal_sign") {
    const [message, address] = paramsArr;
    return [redactMessage(message), address];
  }
  if (method === "eth_sign") {
    const [address, message] = paramsArr;
    return [address, redactMessage(message)];
  }
  if (
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v1" ||
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4"
  ) {
    const [address, typedData] = paramsArr;
    return [address, redactMessage(typedData)];
  }
  if (method === "eth_sendTransaction" || method === "eth_signTransaction") {
    const [tx] = paramsArr;
    if (!tx || typeof tx !== "object") return params;
    const t = tx as Record<string, unknown>;
    const data = typeof t.data === "string" ? t.data : undefined;
    const dataPreview =
      data && data.length > 10
        ? `${data.slice(0, 10)}…(${data.length - 10})`
        : data;
    return [
      {
        to: t.to,
        from: t.from,
        value: t.value,
        chainId: t.chainId,
        dataLength: data ? data.length : 0,
        dataSelector: dataPreview,
      },
    ];
  }
  if (method === "solana:signMessage") {
    const [msg] = paramsArr;
    return [redactMessage(msg)];
  }
  return params;
}
