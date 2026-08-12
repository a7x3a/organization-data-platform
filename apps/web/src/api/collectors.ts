import { apiClient } from './client';
import type { Collector, PaginatedResponse, RunStartResponse } from '@odp/shared-types';
import type { CreateCollectorInput, UpdateCollectorInput } from '../types/forms';

export const collectorsApi = {
  list: async (params?: { page?: number; pageSize?: number; sourceId?: string }) => {
    const res = await apiClient.get<PaginatedResponse<Collector>>('/collectors', { params });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<Collector>(`/collectors/${id}`);
    return res.data;
  },

  create: async (data: CreateCollectorInput) => {
    const res = await apiClient.post<Collector>('/collectors', data);
    return res.data;
  },

  update: async (id: string, data: UpdateCollectorInput) => {
    const res = await apiClient.patch<Collector>(`/collectors/${id}`, data);
    return res.data;
  },

  delete: async (id: string) => {
    await apiClient.delete(`/collectors/${id}`);
  },

  run: async (id: string): Promise<RunStartResponse> => {
    const res = await apiClient.post<RunStartResponse>(`/collectors/${id}/run`);
    return res.data;
  },

  enable: async (id: string) => {
    const res = await apiClient.post<Collector>(`/collectors/${id}/enable`);
    return res.data;
  },

  disable: async (id: string) => {
    const res = await apiClient.post<Collector>(`/collectors/${id}/disable`);
    return res.data;
  },
};
