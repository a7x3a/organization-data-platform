import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, dashboardApi } from '../api/sources';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
    placeholderData: (previousData) => previousData,
    staleTime: 3000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        (data.runningRuns > 0 ||
          data.recentRuns?.some(
            (r) =>
              r.status === 'RUNNING' || r.status === 'PENDING' || r.status === 'CANCEL_REQUESTED'
          ))
      ) {
        return 2000; // Poll dashboard stats every 2s while runs are active
      }
      return 10000;
    },
  });
}

export function useSources(params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['sources', params],
    queryFn: () => sourcesApi.list(params),
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
  });
}

export function useSource(id: string) {
  return useQuery({
    queryKey: ['sources', id],
    queryFn: () => sourcesApi.get(id),
    enabled: !!id,
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
  });
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sourcesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof sourcesApi.update>[1] }) =>
      sourcesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sourcesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}
