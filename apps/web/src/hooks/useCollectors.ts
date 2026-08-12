import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectorsApi } from '../api/collectors';

export function useCollectors(params?: { page?: number; pageSize?: number; sourceId?: string }) {
  return useQuery({
    queryKey: ['collectors', params],
    queryFn: () => collectorsApi.list(params),
  });
}

export function useCollector(id: string) {
  return useQuery({
    queryKey: ['collectors', id],
    queryFn: () => collectorsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateCollector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: collectorsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collectors'] }),
  });
}

export function useUpdateCollector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof collectorsApi.update>[1] }) =>
      collectorsApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collectors'] }),
  });
}

export function useDeleteCollector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: collectorsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collectors'] }),
  });
}

export function useRunCollector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: collectorsApi.run,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useEnableCollector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: collectorsApi.enable,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collectors'] }),
  });
}

export function useDisableCollector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: collectorsApi.disable,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collectors'] }),
  });
}
