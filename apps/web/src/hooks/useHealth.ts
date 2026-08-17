import { useQuery } from '@tanstack/react-query';
import { fetchSystemHealth, SystemHealthStatus } from '../api/health';

export function useHealth() {
  return useQuery<SystemHealthStatus>({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 10000, // Poll every 10s
    staleTime: 5000,
    placeholderData: (previousData) => previousData,
  });
}
