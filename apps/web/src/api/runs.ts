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

  delete: async (id: string) => {
    await apiClient.delete(`/runs/${id}`);
  },
};
