import type { IntentInspector } from "../inspector";

export const HttpsInspector: IntentInspector = {
  name: "https",
  priority: 0,
  mode: "auto",
  async inspect(intent) {
    const url = intent.origin.url ?? "";
    if (url.startsWith("http://")) {
      return {
        annotations: [
          {
            code: "origin.insecure",
            severity: "info",
            title: "Insecure origin",
            detail: "This site is loaded over HTTP, not HTTPS.",
            source: "https",
          },
        ],
        verdict: "allow",
      };
    }
    return { annotations: [], verdict: "allow" };
  },
};
