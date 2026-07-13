import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api/v2',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('v2 API: 401 Unauthorized — token may be expired.');
    }
    return Promise.reject(error);
  }
);

export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

export default apiClient;
