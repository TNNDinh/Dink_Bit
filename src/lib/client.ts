"use client";
import { useCallback, useEffect, useState } from "react";
import { redirect } from "next/navigation";
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options?.headers }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) redirect("/login");
    throw new Error(data.error || "Không thể kết nối. Vui lòng thử lại.");
  }
  return data;
}
export const mutate = <T = unknown>(action: string, data: unknown) => api<T>("/api/book", { method: "POST", body: JSON.stringify({ action, data }) });
export function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timeout = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timeout); }, [value, delay]);
  return debounced;
}
export function useResource<T>(url: string, revision = 0) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setState({ loading: true });
      try { const data = await api<T>(url, { signal: controller.signal }); if (!controller.signal.aborted) setState({ data, loading: false }); }
      catch (error) { if (!controller.signal.aborted) setState({ error: (error as Error).message, loading: false }); }
    };
    void load();
    return () => controller.abort();
  }, [url, revision, retry]);
  const reload = useCallback(() => setRetry((value) => value + 1), []);
  return { ...state, reload };
}
