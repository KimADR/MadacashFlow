'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Membership = {
  tenantId: string;
  tenantName: string;
  role: string;
};

type ApiError = { message?: string };

export function LoginForm() {
  const router = useRouter();
  const [csrfToken, setCsrfToken] = useState('');
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Impossible de préparer la connexion. Réessayez.');
        }
        const result: { csrfToken: string } = await response.json();
        setCsrfToken(result.csrfToken);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
      });
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error((result as ApiError).message ?? 'Connexion impossible.');
      }

      const availableMemberships = result.memberships as Membership[];
      if (!availableMemberships.length) {
        throw new Error('Aucune entreprise active n’est associée à ce compte.');
      }

      setMemberships(availableMemberships);
      setSelectedTenantId(availableMemberships[0].tenantId);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTenantSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/auth/tenant', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ tenantId: selectedTenantId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error((result as ApiError).message ?? 'Sélection d’entreprise impossible.');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  if (memberships.length > 0) {
    return (
      <form className="mt-6 space-y-4" onSubmit={handleTenantSelection}>
        <label className="block text-sm font-medium text-navy" htmlFor="tenantId">
          Entreprise
          <select
            id="tenantId"
            name="tenantId"
            value={selectedTenantId}
            onChange={(event) => setSelectedTenantId(event.target.value)}
            className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            required
          >
            {memberships.map((membership) => (
              <option key={membership.tenantId} value={membership.tenantId}>
                {membership.tenantName} — {membership.role}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={isLoading || !csrfToken}
          className="w-full rounded-md bg-primary px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isLoading ? 'Chargement…' : 'Continuer'}
        </button>
      </form>
    );
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleLogin}>
      <label className="block text-sm font-medium text-navy" htmlFor="email">
        Adresse e-mail
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          maxLength={320}
          required
          className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="block text-sm font-medium text-navy" htmlFor="password">
        Mot de passe
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
          className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button
        type="submit"
        disabled={isLoading || !csrfToken}
        className="w-full rounded-md bg-primary px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {isLoading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
