import { apiClient } from './client';
import type { Source, PaginatedResponse, DashboardStats } from '@odp/shared-types';
import type { CreateSourceInput, UpdateSourceInput } from '../types/forms';

export const sourcesApi = {
  list: async (params?: { page?: number; pageSize?: number }) => {
    const res = await apiClient.get<PaginatedResponse<Source>>('/sources', { params });
    return res.data;
  },

  get: async (id: string) => {
    const res = await apiClient.get<Source>(`/sources/${id}`);
    return res.data;
  },

  create: async (data: CreateSourceInput) => {
    const res = await apiClient.post<Source>('/sources', data);
    return res.data;
  },

  update: async (id: string, data: UpdateSourceInput) => {
    const res = await apiClient.patch<Source>(`/sources/${id}`, data);
    return res.data;
  },

  delete: async (id: string) => {
    await apiClient.delete(`/sources/${id}`);
  },
};

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const res = await apiClient.get<DashboardStats>('/runs/dashboard/stats');
    return res.data;
  },
};
