'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentImportForm } from './payment-import-form';

function formatAr(amountAr: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(BigInt(amountAr))} Ar`;
}

type Client = { id: string; reference: string; name: string };
type Invoice = {
  id: string;
  number: string;
  amountAr: string;
  remainingAr: string;
  status: 'ACTIVE' | 'CANCELLED';
  client: Client;
};
type Payment = {
  id: string;
  clientId: string;
  amountAr: string;
  receivedAt: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHEQUE' | 'OTHER';
  reference: string | null;
  status: 'PENDING' | 'CONFIRMED';
  allocatedAr: string;
  unallocatedAr: string;
  client: Client;
  allocations: Array<{
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    amountAr: string;
  }>;
};

const methodLabels: Record<Payment['method'], string> = {
  CASH: 'Espèces',
  BANK_TRANSFER: 'Virement bancaire',
  MOBILE_MONEY: 'Mobile money (saisie manuelle)',
  CHEQUE: 'Chèque',
  OTHER: 'Autre',
};

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de préparer cette opération.');
  const result: { csrfToken: string } = await response.json();
  return result.csrfToken;
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const result = await response.json().catch(() => ({}));
  const message = Array.isArray(result.message)
    ? result.message.join(' ')
    : result.message;
  return new Error(typeof message === 'string' ? message : fallback);
}

export function PaymentManagement({
  clients,
  invoices,
  payments,
  canManage,
}: {
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    setMessage('');
    setBusyAction('create');
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/v1/payments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          clientId: data.get('clientId'),
          amountAr: data.get('amountAr'),
          receivedAt: data.get('receivedAt'),
          method: data.get('method'),
          reference: data.get('reference'),
        }),
      });
      if (!response.ok) throw await readError(response, 'Impossible d’enregistrer le paiement.');
      form.reset();
      setMessage('Paiement enregistré en attente de confirmation.');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setBusyAction('');
    }
  }

  async function confirmPayment(paymentId: string) {
    setError('');
    setMessage('');
    setBusyAction(paymentId);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/v1/payments/${paymentId}/confirm`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) throw await readError(response, 'Impossible de confirmer le paiement.');
      setMessage('Paiement confirmé.');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setBusyAction('');
    }
  }

  async function allocatePayment(payment: Payment, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    setMessage('');
    setBusyAction(payment.id);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/v1/payments/${payment.id}/allocations`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          invoiceId: data.get('invoiceId'),
          amountAr: data.get('amountAr'),
        }),
      });
      if (!response.ok) throw await readError(response, 'Impossible d’affecter le paiement.');
      form.reset();
      setMessage('Paiement affecté à la facture.');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <>
      {canManage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Saisir un paiement manuel</h2>
          <form onSubmit={createPayment} className="grid gap-4 sm:grid-cols-2">
            <label htmlFor="payment-client" className="text-sm font-medium">
              Client
              <select id="payment-client" name="clientId" required disabled={clients.length === 0} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">
                <option value="">Choisir un client</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name} ({client.reference})</option>)}
              </select>
            </label>
            <label htmlFor="payment-amount" className="text-sm font-medium">
              Montant reçu (ariary entiers)
              <input id="payment-amount" name="amountAr" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={19} required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label htmlFor="payment-date" className="text-sm font-medium">
              Date de réception
              <input id="payment-date" name="receivedAt" type="date" required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label htmlFor="payment-method" className="text-sm font-medium">
              Mode de paiement
              <select id="payment-method" name="method" required className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">
                {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="payment-reference" className="text-sm font-medium sm:col-span-2">
              Référence (facultative)
              <input id="payment-reference" name="reference" maxLength={120} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <div className="sm:col-span-2">
              <button disabled={busyAction !== '' || clients.length === 0} className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                {busyAction === 'create' ? 'Enregistrement…' : 'Enregistrer en attente'}
              </button>
              <p className="mt-2 text-xs text-slate-500">Aucune intégration bancaire n’est activée. La confirmation reste manuelle par un rôle Finance ou Admin.</p>
            </div>
          </form>
        </section>
      )}

      {(error || message) && (
        <p className={`rounded-md p-3 text-sm ${error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`} role={error ? 'alert' : 'status'}>
          {error || message}
        </p>
      )}

      {canManage && <PaymentImportForm />}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Historique des paiements</h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">Aucun paiement. Les paiements saisis apparaîtront ici.</p>
        ) : payments.map((payment) => {
          const eligibleInvoices = invoices.filter(
            (invoice) =>
              invoice.status === 'ACTIVE' &&
              invoice.client.id === payment.clientId &&
              BigInt(invoice.remainingAr) > 0n &&
              !payment.allocations.some((allocation) => allocation.invoiceId === invoice.id),
          );
          return (
            <article key={payment.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{payment.client.name} · {formatAr(payment.amountAr)}</h3>
                  <p className="mt-1 text-sm text-slate-600">{payment.receivedAt} · {methodLabels[payment.method]}{payment.reference ? ` · Réf. ${payment.reference}` : ''}</p>
                  <p className="mt-1 text-sm text-slate-600">Affecté : {formatAr(payment.allocatedAr)} · Non affecté : {formatAr(payment.unallocatedAr)}</p>
                  {payment.allocations.map((allocation) => (
                    <p key={allocation.id} className="mt-1 text-xs text-slate-500">
                      {allocation.invoiceNumber} : {formatAr(allocation.amountAr)}
                    </p>
                  ))}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${payment.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
                  {payment.status === 'CONFIRMED' ? 'Confirmé' : 'En attente'}
                </span>
              </div>

              {canManage && payment.status === 'PENDING' && (
                <button type="button" onClick={() => confirmPayment(payment.id)} disabled={busyAction !== ''} className="mt-4 rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-blue-50 disabled:opacity-60">
                  {busyAction === payment.id ? 'Confirmation…' : 'Confirmer le paiement'}
                </button>
              )}

              {canManage && payment.status === 'CONFIRMED' && BigInt(payment.unallocatedAr) > 0n && (
                <form onSubmit={(event) => allocatePayment(payment, event)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="text-sm font-medium">
                    Facture du même client
                    <select name="invoiceId" required disabled={eligibleInvoices.length === 0} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">
                      <option value="">Choisir une facture ouverte</option>
                      {eligibleInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · solde {formatAr(invoice.remainingAr)}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Montant à affecter (Ar)
                    <input name="amountAr" type="text" inputMode="numeric" pattern="[0-9]+" maxLength={19} required className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" />
                  </label>
                  <button disabled={busyAction !== '' || eligibleInvoices.length === 0} className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                    Affecter
                  </button>
                  {eligibleInvoices.length === 0 && <p className="text-xs text-slate-500 sm:col-span-3">Aucune facture active et non soldée disponible pour ce client.</p>}
                </form>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
