'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type CollectionItem = {
  id: string;
  number: string;
  dueDate: string;
  amountAr: string;
  remainingAr: string;
  client: { id: string; reference: string; name: string };
  dispute: { openedAt: string; reason: string | null } | null;
  promise: { promisedDate: string; amountAr: string } | null;
  latestEventType:
    | 'REMINDER_RECORDED'
    | 'PROMISE_RECORDED'
    | 'DISPUTE_OPENED'
    | 'DISPUTE_RESOLVED'
    | null;
};
type CollectionEvent = {
  id: string;
  type:
    | 'REMINDER_RECORDED'
    | 'PROMISE_RECORDED'
    | 'DISPUTE_OPENED'
    | 'DISPUTE_RESOLVED';
  channel: 'EMAIL' | 'PHONE' | 'IN_PERSON' | 'OTHER' | null;
  note: string | null;
  promisedDate: string | null;
  amountAr: string | null;
  createdAt: string;
  user: { email: string };
};

const eventLabels: Record<CollectionEvent['type'], string> = {
  REMINDER_RECORDED: 'Relance enregistrée',
  PROMISE_RECORDED: 'Promesse enregistrée (pas un encaissement)',
  DISPUTE_OPENED: 'Litige ouvert',
  DISPUTE_RESOLVED: 'Litige résolu',
};
const channelLabels = {
  EMAIL: 'Courriel',
  PHONE: 'Téléphone',
  IN_PERSON: 'En personne',
  OTHER: 'Autre',
} as const;

function formatAr(amountAr: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(BigInt(amountAr))} Ar`;
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', {
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('Impossible de préparer cette opération.');
  const body: { csrfToken: string } = await response.json();
  return body.csrfToken;
}

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  const message = Array.isArray(body.message)
    ? body.message.join(' ')
    : body.message;
  return new Error(typeof message === 'string' ? message : fallback);
}

export function CollectionQueue({
  items,
  canManage,
}: {
  items: CollectionItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [events, setEvents] = useState<Record<string, CollectionEvent[]>>({});

  async function submitEvent(
    invoiceId: string,
    endpoint: string,
    payload: Record<string, string>,
    fallback: string,
  ): Promise<boolean> {
    setBusyId(invoiceId);
    setError('');
    setNotice('');
    try {
      const token = await csrfToken();
      const response = await fetch(
        `/api/v1/collections/invoices/${invoiceId}/${endpoint}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
          },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw await responseError(response, fallback);
      setNotice('Action enregistrée et journalisée.');
      router.refresh();
      return true;
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : 'Une erreur est survenue.',
      );
      return false;
    } finally {
      setBusyId('');
    }
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
    invoiceId: string,
    endpoint: string,
    fallback: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = Object.fromEntries(
      Array.from(data.entries()).map(([key, value]) => [key, String(value)]),
    );
    if (await submitEvent(invoiceId, endpoint, payload, fallback)) form.reset();
  }

  async function loadEvents(invoiceId: string) {
    setBusyId(invoiceId);
    setError('');
    try {
      const response = await fetch(
        `/api/v1/collections/invoices/${invoiceId}/events`,
        { credentials: 'same-origin' },
      );
      if (!response.ok)
        throw await responseError(
          response,
          'Impossible de charger l’historique.',
        );
      const result: { items: CollectionEvent[] } = await response.json();
      setEvents((current) => ({ ...current, [invoiceId]: result.items }));
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : 'Une erreur est survenue.',
      );
    } finally {
      setBusyId('');
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        Aucune facture ouverte à suivre. Les factures soldées ou annulées sont
        exclues.
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-label="File de recouvrement">
      {error && (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          className="rounded-md bg-green-50 p-3 text-sm text-green-800"
          role="status"
        >
          {notice}
        </p>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">
                {item.number} · {item.client.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {item.client.reference} · Échéance : {item.dueDate}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Montant initial : {formatAr(item.amountAr)} · Solde restant :{' '}
                <strong>{formatAr(item.remainingAr)}</strong>
              </p>
            </div>
            {item.dispute ? (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                Litige ouvert
              </span>
            ) : (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                Suivi actif
              </span>
            )}
          </header>

          {item.promise && (
            <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              Promesse : {formatAr(item.promise.amountAr)} pour le{' '}
              {item.promise.promisedDate} — ce montant n’est pas un
              encaissement.
            </p>
          )}
          {item.dispute && (
            <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-900">
              Motif du litige : {item.dispute.reason}
            </p>
          )}

          {canManage && (
            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
              {item.dispute ? (
                <form
                  onSubmit={(event) =>
                    submitForm(
                      event,
                      item.id,
                      'disputes/resolve',
                      'Impossible de résoudre le litige.',
                    )
                  }
                  className="space-y-2"
                >
                  <label
                    htmlFor={`resolve-note-${item.id}`}
                    className="block text-sm font-medium"
                  >
                    Note de résolution (facultative)
                  </label>
                  <input
                    id={`resolve-note-${item.id}`}
                    name="note"
                    maxLength={1000}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    disabled={busyId !== ''}
                    className="rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-60"
                  >
                    Résoudre le litige
                  </button>
                </form>
              ) : (
                <>
                  <form
                    onSubmit={(event) =>
                      submitForm(
                        event,
                        item.id,
                        'reminders',
                        'Impossible d’enregistrer la relance.',
                      )
                    }
                    className="space-y-2"
                  >
                    <h3 className="text-sm font-semibold">
                      Enregistrer une relance manuelle
                    </h3>
                    <label htmlFor={`channel-${item.id}`} className="sr-only">
                      Canal de la relance
                    </label>
                    <select
                      id={`channel-${item.id}`}
                      name="channel"
                      required
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="PHONE">Téléphone</option>
                      <option value="EMAIL">Courriel</option>
                      <option value="IN_PERSON">En personne</option>
                      <option value="OTHER">Autre</option>
                    </select>
                    <label
                      htmlFor={`reminder-note-${item.id}`}
                      className="sr-only"
                    >
                      Note de relance
                    </label>
                    <input
                      id={`reminder-note-${item.id}`}
                      name="note"
                      maxLength={1000}
                      placeholder="Note facultative, sans données personnelles excessives"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      disabled={busyId !== ''}
                      className="rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-60"
                    >
                      Journaliser la relance
                    </button>
                  </form>
                  <form
                    onSubmit={(event) =>
                      submitForm(
                        event,
                        item.id,
                        'promises',
                        'Impossible d’enregistrer la promesse.',
                      )
                    }
                    className="space-y-2"
                  >
                    <h3 className="text-sm font-semibold">
                      Enregistrer une promesse
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label
                        htmlFor={`promise-date-${item.id}`}
                        className="text-xs font-medium"
                      >
                        Date promise
                        <input
                          id={`promise-date-${item.id}`}
                          name="promisedDate"
                          type="date"
                          required
                          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                        />
                      </label>
                      <label
                        htmlFor={`promise-amount-${item.id}`}
                        className="text-xs font-medium"
                      >
                        Montant promis (Ar)
                        <input
                          id={`promise-amount-${item.id}`}
                          name="amountAr"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]+"
                          maxLength={19}
                          required
                          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                        />
                      </label>
                    </div>
                    <label
                      htmlFor={`promise-note-${item.id}`}
                      className="sr-only"
                    >
                      Note de promesse
                    </label>
                    <input
                      id={`promise-note-${item.id}`}
                      name="note"
                      maxLength={1000}
                      placeholder="Note facultative"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      disabled={busyId !== ''}
                      className="rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary disabled:opacity-60"
                    >
                      Enregistrer la promesse
                    </button>
                  </form>
                  <form
                    onSubmit={(event) =>
                      submitForm(
                        event,
                        item.id,
                        'disputes',
                        'Impossible d’ouvrir le litige.',
                      )
                    }
                    className="space-y-2 lg:col-span-2"
                  >
                    <h3 className="text-sm font-semibold">
                      Signaler un litige
                    </h3>
                    <label
                      htmlFor={`dispute-reason-${item.id}`}
                      className="sr-only"
                    >
                      Motif du litige
                    </label>
                    <input
                      id={`dispute-reason-${item.id}`}
                      name="reason"
                      required
                      minLength={1}
                      maxLength={1000}
                      placeholder="Motif du litige"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      disabled={busyId !== ''}
                      className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-800 disabled:opacity-60"
                    >
                      Ouvrir le litige et suspendre le suivi
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => loadEvents(item.id)}
              disabled={busyId !== ''}
              className="text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              {busyId === item.id
                ? 'Chargement…'
                : events[item.id]
                  ? 'Actualiser l’historique'
                  : 'Afficher l’historique'}
            </button>
            {events[item.id] &&
              (events[item.id].length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  Aucune action enregistrée.
                </p>
              ) : (
                <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
                  {events[item.id].map((event) => (
                    <li key={event.id} className="text-sm">
                      <p className="font-medium">
                        {eventLabels[event.type]} ·{' '}
                        {new Date(event.createdAt).toLocaleString('fr-FR', {
                          timeZone: 'Indian/Antananarivo',
                        })}
                      </p>
                      {event.channel && (
                        <p className="text-slate-600">
                          Canal : {channelLabels[event.channel]}
                        </p>
                      )}
                      {event.promisedDate && event.amountAr && (
                        <p className="text-slate-600">
                          Promis : {formatAr(event.amountAr)} pour le{' '}
                          {event.promisedDate} (non encaissé)
                        </p>
                      )}
                      {event.note && (
                        <p className="text-slate-600">{event.note}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        Par {event.user.email}
                      </p>
                    </li>
                  ))}
                </ol>
              ))}
          </div>
        </article>
      ))}
    </section>
  );
}
