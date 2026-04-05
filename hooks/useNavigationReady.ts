import { useEffect, useState } from "react";

/**
 * Returns `false` during the navigation push animation, then `true` once
 * the JS thread is idle.  Use this to defer heavy screen content so the
 * JS thread is free to drive the transition animation without stutter.
 *
 * Usage:
 *   const ready = useNavigationReady();
 *   if (!ready) return <View style={{ flex: 1, backgroundColor: "#f5f6f9" }} />;
 */
export function useNavigationReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = requestIdleCallback(() => setReady(true));
    return () => cancelIdleCallback(id);
  }, []);

  return ready;
}
