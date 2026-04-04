import { useEffect, useState } from "react";
import { InteractionManager } from "react-native";

/**
 * Returns `false` during the navigation push animation, then `true` once
 * interactions are settled.  Use this to defer heavy screen content so the
 * JS thread is free to drive the transition animation without stutter.
 *
 * Usage:
 *   const ready = useNavigationReady();
 *   if (!ready) return <View style={{ flex: 1, backgroundColor: "#f5f6f9" }} />;
 */
export function useNavigationReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel();
  }, []);

  return ready;
}
