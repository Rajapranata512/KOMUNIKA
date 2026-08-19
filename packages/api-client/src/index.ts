export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export function createApiClient({ baseUrl, fetch = globalThis.fetch }: ApiClientOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  return {
    async health(): Promise<HealthResponse> {
      const response = await fetch(`${normalizedBaseUrl}/health`, {
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`API health request failed with status ${response.status}`);
      return (await response.json()) as HealthResponse;
    },
  };
}
