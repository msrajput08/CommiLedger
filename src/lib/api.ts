export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error('Account services are not configured here. Local reconciliation is available.');
  }
  if (!response.ok)
    throw new Error(data.error?.message || data.error || data.message || 'Request failed');
  return data;
}
