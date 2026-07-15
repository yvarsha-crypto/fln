import apiClient from './client';
import type { Student } from '../types';

export interface StudentListResponse {
  students: Student[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const studentAPI = {
  list: async (token: string, params?: {
    search?: string;
    status?: string;
    class?: number;
    section?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: string;
  }) => {
    const { data } = await apiClient.get<StudentListResponse>('/students', {
      headers: authHeader(token),
      params
    });
    return data;
  },

  create: async (token: string, studentData: Record<string, any>) => {
    const { data } = await apiClient.post<Student>('/students', studentData, {
      headers: authHeader(token)
    });
    return data;
  },

  update: async (token: string, id: string, studentData: Record<string, any>) => {
    const { data } = await apiClient.put<Student>(`/students/${id}`, studentData, {
      headers: authHeader(token)
    });
    return data;
  },

  remove: async (token: string, id: string) => {
    const { data } = await apiClient.delete<{ studentId: string; status: string }>(`/students/${id}`, {
      headers: authHeader(token)
    });
    return data;
  },

  reactivate: async (token: string, id: string) => {
    const { data } = await apiClient.post<{ studentId: string; status: string }>(`/students/${id}/reactivate`, {}, {
      headers: authHeader(token)
    });
    return data;
  }
};
