import { apiClient } from './client';
import type { CollectedFile, PaginatedResponse, SignedUrlResponse } from '@odp/shared-types';

export const filesApi = {
  list: async (params?: {
    page?: number;
    pageSize?: number;
    collectionRunId?: string;
    sourceId?: string;
    status?: string;
    sha256?: string;
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

  syncStorage: async (): Promise<{
    provider: string;
    totalChecked: number;
    syncedCount: number;
    missingCount: number;
    timestamp: string;
  }> => {
    const res = await apiClient.post('/files/sync');
    return res.data;
  },
};
