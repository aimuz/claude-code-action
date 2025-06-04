import fetch from "node-fetch";
import type { RequestInit } from "node-fetch";
import { GITEA_API_URL } from "./config";

export type GiteaClient = {
  request<T = unknown>(path: string, options?: RequestInit): Promise<T>;
};

export function createGiteaClient(token: string): GiteaClient {
  return {
    async request<T = unknown>(
      path: string,
      options: RequestInit = {},
    ): Promise<T> {
      const url = path.startsWith("http") ? path : `${GITEA_API_URL}${path}`;
      const res = await fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `token ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error(
          `Gitea request failed: ${res.status} ${res.statusText}`,
        );
      }
      return (await res.json()) as T;
    },
  };
}
