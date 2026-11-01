'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type OpeningBalance = {
  id: string;
  asOfDate: string;
  amountAr: string;
  updatedAt: string;
} | null;
type ForecastExpense = {
  id: string;
  description: string;
  plannedDate: string;
  amountAr: string;
  status: 'PLANNED' | 'CANCELLED';
};

async function getCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
  });
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

function formatAr(amountAr: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(BigInt(amountAr))} Ar`;
}

export function ForecastControls({
  openingBalance,
  today,
  tomorrow,
  lastForecastDay,
  expenses,
  canManage,
}: {
  openingBalance: OpeningBalance;
  today: string;
  tomorrow: string;
  lastForecastDay: string;
  expenses: ForecastExpense[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    method: 'POST' | 'PATCH',
    successMessage: string,
    fallback: string,
    resetOnSuccess = false,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(
      Array.from(formData.entries()).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
    setBusy(endpoint);
    setError('');
    setNotice('');
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/v1${endpoint}`, {
        method,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await readError(response, fallback);
      setNotice(successMessage);
      if (resetOnSuccess) form.reset();
      router.refresh();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : 'Une erreur est survenue.',
      );
    } finally {
      setBusy('');
    }
  }

  async function cancelExpense(expenseId: string) {
    const endpoint = `/forecast/expenses/${expenseId}/cancel`;
    setBusy(expenseId);
    setError('');
    setNotice('');
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/v1${endpoint}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      if (!response.ok) {
        throw await readError(response, 'Impossible d’annuler la dépense.');
      }
      setNotice('Dépense prévue annulée.');
      router.refresh();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : 'Une erreur est survenue.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {error && (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 lg:col-span-2"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="rounded-md bg-green-50 p-3 text-sm text-green-800 lg:col-span-2"
          role="status"
        >
          {notice}
        </p>
      )}
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Solde de départ</h2>
        <p className="mt-1 text-sm text-slate-600">
          Saisissez le solde de trésorerie réel au début de la journée. Il est
          conservé et audité par entreprise.
        </p>
        {openingBalance && (
          <p className="mt-3 text-sm">
            Enregistré : <strong>{formatAr(openingBalance.amountAr)}</strong>
          </p>
        )}
        {canManage ? (
          <form
            onSubmit={(event) =>
              submit(
                event,
                '/forecast/opening-balance',
                'POST',
                'Solde de départ enregistré et audité.',
                'Impossible d’enregistrer le solde de départ.',
              )
            }
            className="mt-4 space-y-3"
          >
            <label htmlFor="opening-date" className="block text-sm font-medium">
              Date du solde
              <input
                id="opening-date"
                name="asOfDate"
                type="date"
                value={today}
                readOnly
                className="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2"
              />
            </label>
            <label
              htmlFor="opening-amount"
              className="block text-sm font-medium"
            >
              Solde disponible (ariary entiers)
              <input
                id="opening-amount"
                name="amountAr"
                type="text"
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={19}
                required
                defaultValue={openingBalance?.amountAr ?? ''}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              disabled={busy !== ''}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {openingBalance
                ? 'Mettre à jour le solde'
                : 'Enregistrer le solde'}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Contactez un rôle FINANCE ou ADMIN pour renseigner le solde de
            départ.
          </p>
        )}
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Dépenses prévues</h2>
        <p className="mt-1 text-sm text-slate-600">
          Seules les dépenses planifiées dans les 13 semaines sont incluses.
          Leur modification et annulation sont journalisées.
        </p>
        {canManage && (
          <form
            onSubmit={(event) =>
              submit(
                event,
                '/forecast/expenses',
                'POST',
                'Dépense prévue enregistrée et auditée.',
                'Impossible d’enregistrer cette dépense.',
                true,
              )
            }
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label
              htmlFor="expense-description"
              className="text-sm font-medium sm:col-span-2"
            >
              Description
              <input
                id="expense-description"
                name="description"
                maxLength={200}
                required
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label htmlFor="expense-date" className="text-sm font-medium">
              Date prévue
              <input
                id="expense-date"
                name="plannedDate"
                type="date"
                min={tomorrow}
                max={lastForecastDay}
                required
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label htmlFor="expense-amount" className="text-sm font-medium">
              Montant (ariary entiers)
              <input
                id="expense-amount"
                name="amountAr"
                type="text"
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={19}
                required
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              disabled={busy !== ''}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
            >
              Ajouter la dépense prévue
            </button>
          </form>
        )}

        <div className="mt-5 space-y-3">
          {expenses.length === 0 ? (
            <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
              Aucune dépense prévue dans la période de 13 semaines.
            </p>
          ) : (
            expenses.map((expense) => (
              <form
                key={expense.id}
                onSubmit={(event) =>
                  submit(
                    event,
                    `/forecast/expenses/${expense.id}`,
                    'PATCH',
                    'Dépense prévue mise à jour.',
                    'Impossible de modifier cette dépense.',
                  )
                }
                className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_160px_180px_auto]"
              >
                <label
                  htmlFor={`description-${expense.id}`}
                  className="sr-only"
                >
                  Description
                </label>
                <input
                  id={`description-${expense.id}`}
                  name="description"
                  defaultValue={expense.description}
                  maxLength={200}
                  required
                  readOnly={!canManage}
                  className="min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm read-only:border-transparent read-only:bg-transparent"
                />
                <label htmlFor={`date-${expense.id}`} className="sr-only">
                  Date prévue
                </label>
                <input
                  id={`date-${expense.id}`}
                  name="plannedDate"
                  type="date"
                  min={tomorrow}
                  defaultValue={expense.plannedDate}
                  required
                  readOnly={!canManage}
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm read-only:border-transparent read-only:bg-transparent"
                />
                <label htmlFor={`amount-${expense.id}`} className="sr-only">
                  Montant en ariary
                </label>
                <input
                  id={`amount-${expense.id}`}
                  name="amountAr"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  maxLength={19}
                  defaultValue={expense.amountAr}
                  required
                  readOnly={!canManage}
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm read-only:border-transparent read-only:bg-transparent"
                />
                {canManage && (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      disabled={busy !== ''}
                      className="rounded-md border border-primary px-3 py-2 text-xs font-medium text-primary disabled:opacity-60"
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelExpense(expense.id)}
                      disabled={busy !== ''}
                      className="rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-800 disabled:opacity-60"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </form>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
