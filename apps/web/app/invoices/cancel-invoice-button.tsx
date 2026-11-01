'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function cancelInvoice() {
    if (!window.confirm('Annuler cette facture ? Cette action sera journalisée et ne pourra pas être supprimée.')) {
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const csrfResponse = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
      if (!csrfResponse.ok) throw new Error('Impossible de préparer l’annulation.');
      const { csrfToken }: { csrfToken: string } = await csrfResponse.json();
      const response = await fetch(`/api/v1/invoices/${invoiceId}/cancel`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message ?? 'Impossible d’annuler la facture.');
      }
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
      setIsLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={cancelInvoice} disabled={isLoading} className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">
        {isLoading ? 'Annulation…' : 'Annuler'}
      </button>
      {error && <p className="mt-1 max-w-48 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
