import ky from "ky";

interface ApiError {
  message?: string;
}

export const api = ky.create({
  prefixUrl: process.env.EXPO_PUBLIC_API_URL,
  timeout: 30000,
  hooks: {
    beforeRequest: [
      (request) => {
        request.headers.set("Accept", "application/json");
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (!response.ok) {
          const error = (await response.json()) as ApiError;
          throw new Error(error.message || "An error occurred");
        }
      },
    ],
  },
  retry: {
    limit: 2,
    methods: ["get", "post", "put", "patch", "delete"],
  },
  fetch: (input, init) => {
    const { signal, ...restInit } = init || {};
    return fetch(input, restInit);
  },
});
