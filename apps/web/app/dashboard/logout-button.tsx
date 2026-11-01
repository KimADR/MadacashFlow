'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function logout() {
    setError('');
    setIsLoading(true);
    try {
      const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
      if (!csrfResponse.ok) {
        throw new Error('Impossible de préparer la déconnexion.');
      }
      const { csrfToken }: { csrfToken: string } = await csrfResponse.json();
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) {
        throw new Error('Déconnexion impossible. Réessayez.');
      }
      router.replace('/login');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={logout}
        disabled={isLoading}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-navy hover:bg-slate-50 disabled:opacity-60"
      >
        {isLoading ? 'Déconnexion…' : 'Se déconnecter'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
