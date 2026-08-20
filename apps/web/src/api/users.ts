import { apiClient } from './client';
import type { User, CreateUserRequest, UpdateUserRequest } from '@odp/shared-types';

export const usersApi = {
  list: async (): Promise<User[]> => {
    const res = await apiClient.get<User[]>('/users');
    return res.data;
  },

  get: async (id: string): Promise<User> => {
    const res = await apiClient.get<User>(`/users/${id}`);
    return res.data;
  },

  create: async (data: CreateUserRequest): Promise<User> => {
    const res = await apiClient.post<User>('/users', data);
    return res.data;
  },

  update: async (id: string, data: UpdateUserRequest): Promise<User> => {
    const res = await apiClient.patch<User>(`/users/${id}`, data);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },
};
