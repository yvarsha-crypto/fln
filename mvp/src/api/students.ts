import apiClient from './client';
import type { Student } from '../types';

export interface StudentListResponse {
  students: Student[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BulkUploadResult {
  inserted: number;
  failed: number;
  duplicate: number;
  total: number;
  results: { row: number; studentName: string; status: string; studentId?: string; error?: string }[];
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const studentAPI = {
  login: async (email: string, password: string) => {
    const { data } = await apiClient.post('/auth/login', { email, password });
    return data as { token: string; user: any };
  },

  me: async (token: string) => {
    const { data } = await apiClient.get('/auth/me', { headers: authHeader(token) });
    return data as { user: any };
  },

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

  search: async (token: string, query: string, page?: number, limit?: number) => {
    const { data } = await apiClient.get<{ students: Student[]; total: number }>('/students/search', {
      headers: authHeader(token),
      params: { q: query, page, limit }
    });
    return data;
  },

  create: async (token: string, studentData: Partial<Student>) => {
    const { data } = await apiClient.post<Student>('/students', studentData, {
      headers: authHeader(token)
    });
    return data;
  },

  update: async (token: string, id: string, studentData: Partial<Student>) => {
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
  },

  upload: async (token: string, students: any[]) => {
    const { data } = await apiClient.post<BulkUploadResult>('/students/upload', { students }, {
      headers: authHeader(token)
    });
    return data;
  }
};
