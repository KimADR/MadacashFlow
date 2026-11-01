'use client';

import { FormEvent, useState } from 'react';

type Props = {
  onCreated: () => void;
};

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de préparer le formulaire.');
  const result: { csrfToken: string } = await response.json();
  return result.csrfToken;
}

export function ClientForm({ onCreated }: Props) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/v1/clients', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          reference: formData.get('reference'),
          name: formData.get('name'),
          email: formData.get('email') || undefined,
          phone: formData.get('phone') || undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? 'Impossible de créer le client.');
      }

      form.reset();
      setMessage('Client créé.');
      onCreated();
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-medium text-navy" htmlFor="client-reference">
        Référence
        <input id="client-reference" name="reference" required maxLength={80} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-navy" htmlFor="client-name">
        Nom de l’entreprise
        <input id="client-name" name="name" required maxLength={200} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-navy" htmlFor="client-email">
        E-mail (facultatif)
        <input id="client-email" name="email" type="email" maxLength={320} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-navy" htmlFor="client-phone">
        Téléphone (facultatif)
        <input id="client-phone" name="phone" type="tel" maxLength={40} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <div className="sm:col-span-2">
        <button disabled={isLoading} className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {isLoading ? 'Enregistrement…' : 'Créer le client'}
        </button>
        {message && <p className="mt-2 text-sm" role="status">{message}</p>}
      </div>
    </form>
  );
}
