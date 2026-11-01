import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LogoutButton } from './logout-button';
import { getCurrentUser } from '../../lib/session';
import { formatAr, getApiData } from '../../lib/server-api';

export const metadata: Metadata = {
  title: 'Espace entreprise | MadaCash Flow',
};

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }
  if (!currentUser.tenant || !currentUser.role) {
    redirect('/login');
  }
  const summary = await getApiData<{
    totalOpenAr: string;
    invoiceCount: number;
    dueNext7DaysAr: string;
    dueNext7DaysCount: number;
    buckets: Record<string, { amountAr: string; count: number }>;
  }>('/invoices/summary');
  if (!summary) redirect('/login');

  return (
    <main className="min-h-screen bg-canvas p-6 text-navy">
      <section className="mx-auto mt-12 max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Espace sécurisé
            </p>
            <h1 className="mt-3 text-3xl font-bold">
              Bonjour, {currentUser.user.email}
            </h1>
          </div>
          <LogoutButton />
        </header>
        <div className="mt-8 rounded-xl bg-slate-50 p-5">
          <h2 className="text-lg font-semibold">{currentUser.tenant.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Votre rôle : {currentUser.role}
          </p>
        </div>
        <section
          className="mt-6 grid gap-4 sm:grid-cols-2"
          aria-label="Situation des créances"
        >
          <article className="rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-medium text-slate-600">
              Solde restant à recouvrer
            </h2>
            <p className="mt-2 text-2xl font-bold">
              {formatAr(summary.totalOpenAr)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {summary.invoiceCount} facture(s) active(s)
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-medium text-slate-600">
              Échéances dans les 7 jours
            </h2>
            <p className="mt-2 text-2xl font-bold">
              {formatAr(summary.dueNext7DaysAr)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {summary.dueNext7DaysCount} facture(s) concernée(s)
            </p>
          </article>
        </section>
        <nav className="mt-6 flex flex-wrap gap-3" aria-label="Modules">
          <a
            href="/clients"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Clients
          </a>
          <a
            href="/invoices"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Factures et balance âgée
          </a>
          <a
            href="/payments"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Paiements
          </a>
          <a
            href="/collections"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Recouvrement
          </a>
        </nav>
        <p className="mt-5 text-xs text-slate-500">
          Seuls les paiements confirmés et affectés diminuent le solde des
          factures.
        </p>
      </section>
    </main>
  );
}
