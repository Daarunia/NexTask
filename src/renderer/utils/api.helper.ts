import axios, { AxiosRequestConfig } from 'axios'
const baseUrl = import.meta.env.VITE_BASE_URL as string

/**
 * Erreur HTTP renvoyée par l'API, avec son code de statut.
 * Le message garde le format historique `HTTP <code> - <texte> - <corps>`.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Code HTTP d'une erreur levée par `api`, ou `undefined` (erreur réseau, autre erreur).
 * @param error Erreur interceptée
 */
export function httpStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined
}

const axiosInstance = axios.create({
  baseURL: baseUrl,
  headers: { 'Content-Type': 'application/json' },
})

async function request<T>(method: string, url: string, data?: unknown, options?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await axiosInstance.request<T>({
      method,
      url,
      data,
      ...options,
    })
    return response.data
  } catch (err: any) {
    // Axios error handling
    if (err.response) {
      throw new ApiError(
        err.response.status,
        `HTTP ${err.response.status} - ${err.response.statusText} - ${JSON.stringify(err.response.data)}`,
      )
    } else {
      throw err
    }
  }
}

export const api = {
  get: <T>(url: string, options?: AxiosRequestConfig) => request<T>('GET', url, undefined, options),
  post: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) => request<T>('POST', url, data, options),
  put: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) => request<T>('PUT', url, data, options),
  patch: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) => request<T>('PATCH', url, data, options),
  delete: <T>(url: string, options?: AxiosRequestConfig) => request<T>('DELETE', url, undefined, options),
}
