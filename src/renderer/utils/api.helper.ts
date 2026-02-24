import axios, { AxiosRequestConfig } from "axios";
const baseUrl = import.meta.env.VITE_BASE_URL as string;

const axiosInstance = axios.create({
  baseURL: baseUrl,
  headers: { "Content-Type": "application/json" },
});

async function request<T>(
  method: string,
  url: string,
  data?: unknown,
  options?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await axiosInstance.request<T>({
      method,
      url,
      data,
      ...options,
    });
    return response.data;
  } catch (err: any) {
    // Axios error handling
    if (err.response) {
      throw new Error(
        `HTTP ${err.response.status} - ${err.response.statusText} - ${JSON.stringify(
          err.response.data,
        )}`,
      );
    } else {
      throw err;
    }
  }
}

export const api = {
  get: <T>(url: string, options?: AxiosRequestConfig) =>
    request<T>("GET", url, undefined, options),
  post: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) =>
    request<T>("POST", url, data, options),
  put: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) =>
    request<T>("PUT", url, data, options),
  patch: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) =>
    request<T>("PATCH", url, data, options),
  delete: <T>(url: string, options?: AxiosRequestConfig) =>
    request<T>("DELETE", url, undefined, options),
};
