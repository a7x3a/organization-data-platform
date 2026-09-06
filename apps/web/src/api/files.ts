import { apiClient } from './client';
import type { CollectedFile, PaginatedResponse, SignedUrlResponse } from '@odp/shared-types';

export const filesApi = {
  list: async (params?: {
    page?: number;
    pageSize?: number;
    collectionRunId?: string;
    sourceId?: string;
    status?: string;
    approvalStatus?: string;
    sha256?: string;
    sourceUrl?: string;
    extension?: string;
    category?: string;
    search?: string;
  }) => {
    const res = await apiClient.get<PaginatedResponse<CollectedFile>>('/files', { params });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<CollectedFile>(`/files/${id}`);
    return res.data;
  },

  getDownloadUrl: async (id: string): Promise<SignedUrlResponse> => {
    const res = await apiClient.get<SignedUrlResponse>(`/files/${id}/download-url`);
    return res.data;
  },

  manualUpload: async (data: {
    sourceId: string;
    file: File;
    metadata?: Record<string, unknown>;
  }): Promise<CollectedFile> => {
    const form = new FormData();
    form.append('sourceId', data.sourceId);
    form.append('file', data.file);
    if (data.metadata) form.append('metadata', JSON.stringify(data.metadata));

    const res = await apiClient.post<CollectedFile>('/files/manual-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  manualEntry: async (data: {
    sourceId: string;
    fileName: string;
    mimeType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CollectedFile> => {
    const res = await apiClient.post<CollectedFile>('/files/manual-entry', data);
    return res.data;
  },

  update: async (
    id: string,
    data: { fileName?: string; metadata?: Record<string, unknown> }
  ): Promise<CollectedFile> => {
    const res = await apiClient.patch<CollectedFile>(`/files/${id}`, data);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/files/${id}`);
  },

  bulkDelete: async (fileIds: string[]): Promise<{ deletedCount: number }> => {
    const res = await apiClient.post<{ deletedCount: number }>('/files/bulk-delete', { fileIds });
    return res.data;
  },

  pruneRunFiles: async (
    runId: string,
    options: {
      keepExtensions?: string[];
      keepCategories?: string[];
      deleteExtensions?: string[];
    }
  ): Promise<{ prunedCount: number; remainingCount: number; totalBytesFreed: number }> => {
    const res = await apiClient.post<{ prunedCount: number; remainingCount: number; totalBytesFreed: number }>(
      `/files/run/${runId}/prune`,
      options
    );
    return res.data;
  },

  approve: async (id: string, notes?: string): Promise<CollectedFile> => {
    const res = await apiClient.post<CollectedFile>(`/files/${id}/approve`, { notes });
    return res.data;
  },

  reject: async (id: string, notes?: string): Promise<CollectedFile> => {
    const res = await apiClient.post<CollectedFile>(`/files/${id}/reject`, { notes });
    return res.data;
  },

  bulkApprove: async (fileIds: string[], notes?: string): Promise<{ updatedCount: number }> => {
    const res = await apiClient.post<{ updatedCount: number }>('/files/bulk-approve', { fileIds, notes });
    return res.data;
  },

  bulkReject: async (fileIds: string[], notes?: string): Promise<{ updatedCount: number }> => {
    const res = await apiClient.post<{ updatedCount: number }>('/files/bulk-reject', { fileIds, notes });
    return res.data;
  },

  approveRunFiles: async (runId: string, notes?: string): Promise<{ updatedCount: number }> => {
    const res = await apiClient.post<{ updatedCount: number }>(`/files/run/${runId}/approve-all`, { notes });
    return res.data;
  },

  rejectRunFiles: async (runId: string, notes?: string): Promise<{ updatedCount: number }> => {
    const res = await apiClient.post<{ updatedCount: number }>(`/files/run/${runId}/reject-all`, { notes });
    return res.data;
  },

  syncStorage: async (): Promise<{
    provider: string;
    totalChecked: number;
    syncedCount: number;
    indexedNewCount?: number;
    missingCount: number;
    timestamp: string;
  }> => {
    const res = await apiClient.post('/files/sync');
    return res.data;
  },

  process: async (options: { apply: boolean; limit?: number }) => {
    const res = await apiClient.post<{
      mode: 'preview' | 'applied';
      scanned: number;
      changed: number;
      renamed: number;
      duplicates: number;
      changes: Array<{ id: string; fileId: string; oldName: string; newName: string; duplicate: boolean }>;
    }>('/files/process', options);
    return res.data;
  },

  getContentUrl: (id: string) => `/api/files/${id}/content`,
  getDownloadUrlDirect: (id: string) => `/api/files/${id}/download`,
  getJsonContent: async (id: string): Promise<{ fileId: string; fileName: string; r2Key?: string; isJson: boolean; data?: any; raw?: string }> => {
    const res = await apiClient.get<{ fileId: string; fileName: string; r2Key?: string; isJson: boolean; data?: any; raw?: string }>(`/files/${id}/json`);
    return res.data;
  },
};

export function openCollectedFile(file: Pick<CollectedFile, 'id' | 'status' | 'sourceUrl'>) {
  if (file.status === 'UPLOADED') {
    window.open(`/api/files/${file.id}/content`, '_blank');
  } else if (file.sourceUrl) {
    window.open(file.sourceUrl, '_blank', 'noopener,noreferrer');
  }
}

export function downloadCollectedFile(file: Pick<CollectedFile, 'id'>) {
  const link = document.createElement('a');
  link.href = `/api/files/${file.id}/download`;
  link.download = '';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
