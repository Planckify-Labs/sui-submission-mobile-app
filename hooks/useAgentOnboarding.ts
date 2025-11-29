import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const AGENT_ONBOARDING_KEY = "takumipay_agent_onboarding_completed";

export interface UseAgentOnboardingReturn {
  shouldShowOnboarding: boolean;
  isLoading: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

/**
 * Hook to manage the agent onboarding state
 * Tracks whether the user has completed the onboarding flow
 */
export function useAgentOnboarding(): UseAgentOnboardingReturn {
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const completed = await AsyncStorage.getItem(AGENT_ONBOARDING_KEY);
      setShouldShowOnboarding(completed !== "true");
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      // Default to showing onboarding if there's an error
      setShouldShowOnboarding(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if user has completed onboarding
  useEffect(() => {
    checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(AGENT_ONBOARDING_KEY, "true");
      setShouldShowOnboarding(false);
      console.log("Agent onboarding completed");
    } catch (error) {
      console.error("Failed to save onboarding completion:", error);
    }
  }, []);

  const resetOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(AGENT_ONBOARDING_KEY);
      setShouldShowOnboarding(true);
      console.log("Agent onboarding reset");
    } catch (error) {
      console.error("Failed to reset onboarding:", error);
    }
  }, []);

  return {
    shouldShowOnboarding,
    isLoading,
    completeOnboarding,
    resetOnboarding,
  };
}
