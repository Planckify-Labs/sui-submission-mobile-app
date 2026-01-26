import { useMutation } from "@tanstack/react-query";
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import { Platform } from "react-native";
import { publicApi } from "@/constants/configs/ky";

interface TGoogleAuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
    name?: string;
    role: string;
  };
}

// Configure Google Sign-In (call once at app startup)
export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
};

export const useGoogleSignIn = () => {
  return useMutation<TGoogleAuthResponse, Error>({
    mutationFn: async () => {
      try {
        // Check if Google Play Services are available (Android only)
        await GoogleSignin.hasPlayServices();

        // Attempt sign in
        const signInResult = await GoogleSignin.signIn();

        if (!isSuccessResponse(signInResult)) {
          throw new Error("Google Sign-In was cancelled or failed");
        }

        const idToken = signInResult.data.idToken;

        if (!idToken) {
          throw new Error("No ID token received from Google");
        }

        // Send ID token to backend for verification
        const response = await publicApi
          .post("auth/google", {
            json: {
              idToken,
              platform: Platform.OS,
            },
          })
          .json<TGoogleAuthResponse>();

        return response;
      } catch (error: any) {
        console.log("=== Google Sign-In Error ===");
        console.log("Error:", JSON.stringify(error, null, 2));
        console.log("Error message:", error.message);
        console.log("Error code:", error.code);
        console.log("Error name:", error.name);
        console.log("============================");

        // Handle specific Google Sign-In errors
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          throw new Error("Sign in cancelled");
        } else if (error.code === statusCodes.IN_PROGRESS) {
          throw new Error("Sign in already in progress");
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          throw new Error("Google Play Services not available");
        }
        throw error;
      }
    },
  });
};

export const useGoogleSignOut = () => {
  return useMutation({
    mutationFn: async () => {
      try {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      } catch (error) {
        // User might not be signed in, ignore
        console.warn("Google sign out error:", error);
      }
    },
  });
};
