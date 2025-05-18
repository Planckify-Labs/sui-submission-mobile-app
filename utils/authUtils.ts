import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { Alert } from "react-native";

export async function authenticateUser(promptMessage = "Authenticate to continue"): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: "Use passcode",
    });

    return result.success;
  } catch (error) {
    console.error("Authentication error:", error);
    Alert.alert("Error", "Authentication failed");
    return false;
  }
}

export async function copyToClipboard(text: string, label: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", `${label} copied to clipboard`);
    return true;
  } catch (error) {
    console.error("Clipboard error:", error);
    Alert.alert("Error", "Failed to copy to clipboard");
    return false;
  }
}