import { apiClient } from './client';
import type { CollectionRun, PaginatedResponse } from '@odp/shared-types';

export const runsApi = {
  list: async (params?: {
    page?: number;
    pageSize?: number;
    collectorId?: string;
    sourceId?: string;
    status?: string;
  }) => {
    const res = await apiClient.get<PaginatedResponse<CollectionRun>>('/runs', { params });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<CollectionRun>(`/runs/${id}`);
    return res.data;
  },

  cancel: async (id: string) => {
    const res = await apiClient.post<CollectionRun>(`/runs/${id}/cancel`);
    return res.data;
  },

  pause: async (id: string) => {
    const res = await apiClient.post<CollectionRun>(`/runs/${id}/pause`);
    return res.data;
  },

  resume: async (id: string) => {
    const res = await apiClient.post<CollectionRun>(`/runs/${id}/resume`);
    return res.data;
  },

  forceCancel: async (id: string) => {
    const res = await apiClient.post<CollectionRun>(`/runs/${id}/force-cancel`);
    return res.data;
  },

  delete: async (payload: { id: string; deleteFiles?: boolean } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    const deleteFiles = typeof payload === 'object' ? payload.deleteFiles : false;
    await apiClient.delete(`/runs/${id}`, { params: { deleteFiles } });
  },

  approve: async ({ id, notes }: { id: string; notes?: string }) => {
    const res = await apiClient.post<CollectionRun>(`/runs/${id}/approve`, { notes });
    return res.data;
  },

  reject: async ({ id, notes }: { id: string; notes?: string }) => {
    const res = await apiClient.post<CollectionRun>(`/runs/${id}/reject`, { notes });
    return res.data;
  },

  getManifest: async (id: string): Promise<{ manifestKey: string; manifest?: any; raw?: string }> => {
    const res = await apiClient.get<{ manifestKey: string; manifest?: any; raw?: string }>(`/runs/${id}/manifest`);
    return res.data;
  },

  getMetadata: async (id: string): Promise<{ metadataKey: string; lines?: any[]; count: number; raw?: string }> => {
    const res = await apiClient.get<{ metadataKey: string; lines?: any[]; count: number; raw?: string }>(`/runs/${id}/metadata`);
    return res.data;
  },
};
