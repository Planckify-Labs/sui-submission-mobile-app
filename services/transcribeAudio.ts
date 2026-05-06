function resolveBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_AI_API_URL;
  if (!raw) throw new Error("EXPO_PUBLIC_AI_API_URL is not set");
  return raw.replace(/\/$/, "");
}

function resolveApiKey(): string {
  return process.env.EXPO_PUBLIC_SECRET_AI_KEY ?? "";
}

export type TranscribeResult = {
  text: string;
  language?: string;
  duration?: number;
};

export type TranscribeAudioInput = {
  uri: string;
  mimeType?: string;
  fileName?: string;
};

export async function transcribeAudio({
  uri,
  mimeType = "audio/m4a",
  fileName = "recording.m4a",
}: TranscribeAudioInput): Promise<TranscribeResult> {
  const form = new FormData();
  // React Native FormData accepts the {uri,name,type} shape — fetch
  // streams the file from disk under the hood.
  form.append("file", {
    uri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(`${resolveBaseUrl()}/chat/transcribe`, {
    method: "POST",
    headers: {
      "x-api-key": resolveApiKey(),
    },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Transcription failed: ${res.status} ${detail}`);
  }

  return (await res.json()) as TranscribeResult;
}
