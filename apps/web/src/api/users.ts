import { apiClient } from './client';
import type { User, CreateUserRequest } from '@odp/shared-types';

export const usersApi = {
  list: async (): Promise<User[]> => {
    const res = await apiClient.get<User[]>('/users');
    return res.data;
  },

  create: async (data: CreateUserRequest): Promise<User> => {
    const res = await apiClient.post<User>('/users', data);
    return res.data;
  },
};
