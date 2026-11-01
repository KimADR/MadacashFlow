import { cookies } from 'next/headers';

export async function getApiData<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`L’API a répondu avec le statut HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

export function formatAr(amountAr: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(BigInt(amountAr))} Ar`;
}
