import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { runsApi } from '../api/runs';

export function useRuns(params?: {
  page?: number;
  pageSize?: number;
  collectorId?: string;
  sourceId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['runs', params],
    queryFn: () => runsApi.list(params),
    refetchInterval: 5000, // Poll active runs list every 5s for real-time progress
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'RUNNING' || data.status === 'PENDING' || data.status === 'CANCEL_REQUESTED')) {
        return 2000; // Poll active run detail every 2s
      }
      return false;
    },
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runsApi.cancel,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['runs', id] });
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
