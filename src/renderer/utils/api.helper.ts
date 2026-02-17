const baseUrl = import.meta.env.VITE_BASE_URL as string

async function request<T>(
    method: string,
    url: string,
    data?: unknown,
    options?: RequestInit
): Promise<T> {
    const response = await fetch(`${baseUrl}${url}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
        ...options,
    })

    if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(
            `HTTP ${response.status} - ${response.statusText} - ${errorBody}`
        )
    }

    return response.json() as Promise<T>
}

export const api = {
    get: <T>(url: string, options?: RequestInit) => request<T>("GET", url, undefined, options),
    post: <T>(url: string, data?: unknown, options?: RequestInit) => request<T>("POST", url, data, options),
    put: <T>(url: string, data?: unknown, options?: RequestInit) => request<T>("PUT", url, data, options),
    patch: <T>(url: string, data?: unknown, options?: RequestInit) => request<T>("PATCH", url, data, options),
    delete: <T>(url: string, options?: RequestInit) => request<T>("DELETE", url, undefined, options),
}