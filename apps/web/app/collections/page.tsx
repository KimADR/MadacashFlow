import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatAr, getApiData } from '../../lib/server-api';
import { getCurrentUser } from '../../lib/session';
import { CollectionQueue } from './collection-queue';

export const metadata: Metadata = { title: 'Recouvrement | MadaCash Flow' };

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
type QueueResult = {
  items: CollectionItem[];
  pagination: { page: number; pages: number; total: number };
};
type Summary = {
  totalOpenAr: string;
  buckets: Record<string, { amountAr: string; count: number }>;
};

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.tenantId) redirect('/login');
  const params = await searchParams;
  const requestedPage = Number(params.page ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [queue, summary] = await Promise.all([
    getApiData<QueueResult>(`/collections?page=${page}&limit=100`),
    getApiData<Summary>('/invoices/summary'),
  ]);
  if (!queue || !summary) redirect('/login');
  if (queue.pagination.pages > 0 && page > queue.pagination.pages) {
    redirect(`/collections?page=${queue.pagination.pages}`);
  }

  const canManage =
    currentUser.role === 'ADMIN' || currentUser.role === 'FINANCE';

  return (
    <main className="min-h-screen bg-canvas p-6 text-navy">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-primary hover:underline"
            >
              ← Tableau de bord
            </Link>
            <h1 className="mt-2 text-3xl font-bold">Suivi du recouvrement</h1>
            <p className="mt-1 text-slate-600">{currentUser.tenant?.name}</p>
          </div>
          <Link
            href="/invoices"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Voir les factures
          </Link>
        </header>

        <section
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Résumé du recouvrement"
        >
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-medium text-slate-600">Solde ouvert</h2>
            <p className="mt-2 text-lg font-bold">
              {formatAr(summary.totalOpenAr)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-medium text-slate-600">
              Factures en retard
            </h2>
            <p className="mt-2 text-lg font-bold">
              {summary.buckets.days1To30.count +
                summary.buckets.days31To60.count +
                summary.buckets.days61To90.count +
                summary.buckets.over90.count}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-medium text-slate-600">
              Factures ouvertes à suivre
            </h2>
            <p className="mt-2 text-lg font-bold">{queue.pagination.total}</p>
          </article>
        </section>

        <p className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Les relances sont uniquement enregistrées après un contact manuel :
          aucun courriel ni message n’est envoyé automatiquement. Une promesse
          n’est pas un encaissement. Un litige suspend les relances jusqu’à sa
          résolution.
        </p>

        <CollectionQueue items={queue.items} canManage={canManage} />
        {queue.pagination.pages > 1 && (
          <nav
            className="flex items-center justify-between"
            aria-label="Pagination du recouvrement"
          >
            {page > 1 ? (
              <Link
                href={`/collections?page=${page - 1}`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
              >
                ← Précédent
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-slate-600">
              Page {page} sur {queue.pagination.pages}
            </span>
            {page < queue.pagination.pages ? (
              <Link
                href={`/collections?page=${page + 1}`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
              >
                Suivant →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </main>
  );
}
