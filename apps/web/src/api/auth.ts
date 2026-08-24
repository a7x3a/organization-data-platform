import { apiClient } from './client';
import type {
  LoginRequest,
  LoginResponse,
  AuthTokens,
  User,
} from '@odp/shared-types';

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>('/auth/login', data);
    return res.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  refresh: async (): Promise<AuthTokens & { user?: User }> => {
    const res = await apiClient.post<AuthTokens & { user?: User }>('/auth/refresh');
    return res.data;
  },
};
