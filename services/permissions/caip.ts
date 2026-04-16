function djb2Hex(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  // second-pass scramble for better distribution without a real hash lib
  let g = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    g = ((g << 7) ^ input.charCodeAt(i)) | 0;
  }
  return (
    (h >>> 0).toString(16).padStart(8, "0") +
    (g >>> 0).toString(16).padStart(8, "0")
  );
}

export function originKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    const port = u.port ? `:${u.port}` : "";
    return `${u.protocol}//${host}${port}`;
  } catch {
    return url.toLowerCase();
  }
}

export function hashOrigin(url: string): string {
  return djb2Hex(originKey(url));
}

export function originHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return url.toLowerCase();
  }
}

export function caip2(namespace: string, reference: string | number): string {
  return `${namespace}:${reference}`;
}

export function caip10(
  namespace: string,
  reference: string | number,
  address: string,
): string {
  return `${namespace}:${reference}:${address}`;
}
