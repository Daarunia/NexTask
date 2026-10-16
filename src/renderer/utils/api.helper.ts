import axios, { AxiosRequestConfig } from 'axios'
// URL du serveur Fastify, transmise par le main via le preload
const baseUrl = globalThis.server.url

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

/**
 * PATCH qui survit à la fermeture de la page (`fetch` en `keepalive`, que
 * axios ne sait pas faire). Sert à envoyer une modification en attente au
 * déchargement de la fenêtre, sans attendre de réponse, d'où l'absence de
 * retour. Les erreurs sont ignorées, la page n'est plus là pour les montrer.
 *
 * @param url Chemin de la route, relatif au serveur
 * @param data Corps envoyé en JSON
 */
function patchOnUnload(url: string, data: unknown): void {
  fetch(`${baseUrl}${url}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    keepalive: true,
  }).catch(() => undefined)
}

export const api = {
  get: <T>(url: string, options?: AxiosRequestConfig) => request<T>('GET', url, undefined, options),
  post: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) => request<T>('POST', url, data, options),
  put: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) => request<T>('PUT', url, data, options),
  patch: <T>(url: string, data?: unknown, options?: AxiosRequestConfig) => request<T>('PATCH', url, data, options),
  patchOnUnload,
  delete: <T>(url: string, options?: AxiosRequestConfig) => request<T>('DELETE', url, undefined, options),
}
