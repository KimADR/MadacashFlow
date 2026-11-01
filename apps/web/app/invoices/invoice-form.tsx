'use client';

import { FormEvent, useState } from 'react';

type ClientOption = { id: string; reference: string; name: string };

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de préparer le formulaire.');
  const result: { csrfToken: string } = await response.json();
  return result.csrfToken;
}

export function InvoiceForm({
  clients,
  onCreated,
}: {
  clients: ClientOption[];
  onCreated: () => void;
}) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsLoading(true);
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/v1/invoices', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          clientId: data.get('clientId'),
          number: data.get('number'),
          issueDate: data.get('issueDate'),
          dueDate: data.get('dueDate'),
          amountAr: data.get('amountAr'),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message ?? 'Impossible de créer la facture.');
      }

      form.reset();
      setMessage('Facture créée.');
      onCreated();
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="text-sm font-medium text-navy" htmlFor="invoice-client">
        Client
        <select id="invoice-client" name="clientId" required disabled={clients.length === 0} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">
          <option value="">Choisir un client</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name} ({client.reference})</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-navy" htmlFor="invoice-number">
        Numéro de facture
        <input id="invoice-number" name="number" required maxLength={80} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-navy" htmlFor="invoice-issue-date">
        Date de facture
        <input id="invoice-issue-date" name="issueDate" type="date" required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-navy" htmlFor="invoice-due-date">
        Date d’échéance
        <input id="invoice-due-date" name="dueDate" type="date" required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="text-sm font-medium text-navy sm:col-span-2" htmlFor="invoice-amount">
        Montant (ariary entiers)
        <input id="invoice-amount" name="amountAr" type="number" min="1" step="1" inputMode="numeric" required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Saisissez un montant entier sans décimales.</span>
      </label>
      <div className="sm:col-span-2">
        <button disabled={isLoading || clients.length === 0} className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {isLoading ? 'Enregistrement…' : 'Créer la facture'}
        </button>
        {clients.length === 0 && <p className="mt-2 text-sm text-amber-800">Ajoutez d’abord un client pour créer une facture.</p>}
        {message && <p className="mt-2 text-sm" role="status">{message}</p>}
      </div>
    </form>
  );
}
