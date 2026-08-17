import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesApi } from '../api/files';

export function useFiles(
  params?: {
    page?: number;
    pageSize?: number;
    collectionRunId?: string;
    sourceId?: string;
    status?: string;
    sha256?: string;
  },
  options?: {
    refetchInterval?: number | false;
  }
) {
  return useQuery({
    queryKey: ['files', params],
    queryFn: () => filesApi.list(params),
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => filesApi.get(id),
    enabled: !!id,
    placeholderData: (previousData) => previousData,
    staleTime: 5000,
  });
}

export function useFileDownloadUrl(id: string) {
  return useMutation({
    mutationFn: () => filesApi.getDownloadUrl(id),
  });
}

export function useManualUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: filesApi.manualUpload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function useManualEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: filesApi.manualEntry,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function useUpdateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof filesApi.update>[1] }) =>
      filesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: filesApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
