import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi, dashboardApi } from '../api/sources';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: dashboardApi.getStats,
    refetchInterval: 30_000, // Poll every 30s
  });
}

export function useSources(params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['sources', params],
    queryFn: () => sourcesApi.list(params),
  });
}

export function useSource(id: string) {
  return useQuery({
    queryKey: ['sources', id],
    queryFn: () => sourcesApi.get(id),
    enabled: !!id,
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
