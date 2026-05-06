import {
  type AudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";
import { transcribeAudio } from "@/services/transcribeAudio";

export type VoiceStatus = "idle" | "recording" | "transcribing";

export type UseVoiceTranscriptionResult = {
  status: VoiceStatus;
  recorder: AudioRecorder;
  start: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancel: () => Promise<void>;
};

export function useVoiceTranscription(): UseVoiceTranscriptionResult {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  // expo-audio's HIGH_QUALITY preset omits `isMeteringEnabled`, which
  // is what populates `state.metering` for the wave visualizer. Without
  // this flag every metering tick reports `undefined` and the bars
  // flat-line at the minimum height.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });

  const releaseAudioMode = useCallback(async () => {
    if (Platform.OS === "ios") {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }, []);

  const start = useCallback(async () => {
    if (status !== "idle") return;

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Microphone access needed",
        "Enable microphone access in Settings to use voice input.",
      );
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStatus("recording");
  }, [status, recorder]);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (status !== "recording") return null;

    setStatus("transcribing");
    try {
      await recorder.stop();
    } catch {
      setStatus("idle");
      await releaseAudioMode();
      return null;
    }

    const uri = recorder.uri;
    if (!uri) {
      setStatus("idle");
      await releaseAudioMode();
      return null;
    }

    try {
      const isM4a = uri.toLowerCase().endsWith(".m4a");
      const { text } = await transcribeAudio({
        uri,
        mimeType: isM4a ? "audio/m4a" : "audio/mp4",
        fileName: isM4a ? "recording.m4a" : "recording.mp4",
      });
      return text.trim() || null;
    } catch (err) {
      Alert.alert(
        "Transcription failed",
        err instanceof Error ? err.message : "Please try again.",
      );
      return null;
    } finally {
      setStatus("idle");
      await releaseAudioMode();
    }
  }, [status, recorder, releaseAudioMode]);

  const cancel = useCallback(async () => {
    if (status === "recording") {
      await recorder.stop().catch(() => {});
    }
    setStatus("idle");
    await releaseAudioMode();
  }, [status, recorder, releaseAudioMode]);

  return { status, recorder, start, stopAndTranscribe, cancel };
}
