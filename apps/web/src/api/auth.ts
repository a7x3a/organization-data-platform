import { apiClient } from './client';
import type {
  LoginRequest,
  LoginResponse,
  AuthTokens,
} from '@odp/shared-types';

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>('/auth/login', data);
    return res.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  refresh: async (): Promise<AuthTokens> => {
    const res = await apiClient.post<AuthTokens>('/auth/refresh');
    return res.data;
  },
};
