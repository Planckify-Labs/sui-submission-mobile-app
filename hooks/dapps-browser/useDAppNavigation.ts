import { useCallback } from "react";

export const useDAppNavigation = (onNavigateToDapp: (url: string) => void) => {
  const navigateToDApp = useCallback(
    (url: string) => {
      onNavigateToDapp(url);
    },
    [onNavigateToDapp],
  );

  return { navigateToDApp };
};
