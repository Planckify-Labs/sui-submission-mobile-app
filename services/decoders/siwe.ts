export interface ParsedSiwe {
  domain: string;
  address: `0x${string}`;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources: string[];
}

const RE_HEADER =
  /^(?<domain>[^\s]+) wants you to sign in with your Ethereum account:\n(?<address>0x[a-fA-F0-9]{40})\n/;

export function tryParseSiwe(message: string): ParsedSiwe | null {
  if (!message || typeof message !== "string") return null;
  const match = message.match(RE_HEADER);
  if (!match?.groups) return null;
  const domain = match.groups.domain;
  const address = match.groups.address as `0x${string}`;

  const rest = message.slice(match[0].length);

  // After the address line, EIP-4361 expects a blank line, then optionally
  // a statement followed by another blank line, then the URI/Version/… fields.
  // Regex captured "…account:\n0xADDR\n", so `rest` starts right after that.
  let statement: string | undefined;
  let remaining = rest;

  // Consume the mandatory blank line after the address.
  if (rest.startsWith("\n")) {
    remaining = rest.slice(1);
  } else {
    return null;
  }

  // If the next line starts with a known field key, there's no statement.
  // Otherwise everything before the next "\n\n" is the statement.
  if (!remaining.startsWith("URI: ")) {
    const blankIdx = remaining.indexOf("\n\n");
    if (blankIdx === -1) return null;
    statement = remaining.slice(0, blankIdx).trim() || undefined;
    remaining = remaining.slice(blankIdx + 2);
  }

  const out: Partial<ParsedSiwe> & { resources: string[] } = {
    domain,
    address,
    statement,
    resources: [],
  };

  const lines = remaining.split("\n");
  let inResources = false;
  for (const line of lines) {
    if (inResources) {
      if (line.startsWith("- ")) {
        out.resources.push(line.slice(2).trim());
        continue;
      }
      if (!line.trim()) continue;
      inResources = false;
    }
    if (line === "Resources:") {
      inResources = true;
      continue;
    }
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 2).trim();
    switch (key) {
      case "URI":
        out.uri = value;
        break;
      case "Version":
        out.version = value;
        break;
      case "Chain ID":
        out.chainId = Number(value);
        break;
      case "Nonce":
        out.nonce = value;
        break;
      case "Issued At":
        out.issuedAt = value;
        break;
      case "Expiration Time":
        out.expirationTime = value;
        break;
      case "Not Before":
        out.notBefore = value;
        break;
      case "Request ID":
        out.requestId = value;
        break;
    }
  }

  if (
    !out.uri ||
    !out.version ||
    typeof out.chainId !== "number" ||
    Number.isNaN(out.chainId) ||
    !out.nonce ||
    !out.issuedAt
  ) {
    return null;
  }

  return out as ParsedSiwe;
}
