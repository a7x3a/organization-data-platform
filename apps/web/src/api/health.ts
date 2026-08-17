import { apiClient } from './client';

export interface SystemHealthStatus {
  status: 'ready' | 'degraded';
  checks: {
    database: boolean;
    redis: boolean;
    scraper: boolean;
    r2: boolean;
  };
  timestamp: string;
}

export async function fetchSystemHealth(): Promise<SystemHealthStatus> {
  const { data } = await apiClient.get<SystemHealthStatus>('/ready');
  return data;
}
