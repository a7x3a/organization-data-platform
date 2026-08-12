import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesApi } from '../api/files';

export function useFiles(params?: {
  page?: number;
  pageSize?: number;
  collectionRunId?: string;
  sourceId?: string;
  status?: string;
  sha256?: string;
}) {
  return useQuery({
    queryKey: ['files', params],
    queryFn: () => filesApi.list(params),
  });
}

export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => filesApi.get(id),
    enabled: !!id,
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
