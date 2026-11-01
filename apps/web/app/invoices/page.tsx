import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getApiData, formatAr } from '../../lib/server-api';
import { getCurrentUser } from '../../lib/session';
import { CancelInvoiceButton } from './cancel-invoice-button';
import { InvoiceImportForm } from './invoice-import-form';
import { RefreshableInvoiceForm } from './refreshable-invoice-form';

export const metadata: Metadata = { title: 'Factures | MadaCash Flow' };

type Invoice = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  amountAr: string;
  remainingAr: string;
  status: 'ACTIVE' | 'CANCELLED';
  client: { id: string; reference: string; name: string };
};
type PageResult<T> = {
  items: T[];
  pagination: { page: number; pages: number; total: number };
};
type Client = { id: string; reference: string; name: string };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.tenantId) redirect('/login');
  const params = await searchParams;
  const query = new URLSearchParams({ page: params.page ?? '1', limit: '25' });
  if (params.search) query.set('search', params.search);
  if (params.status === 'ACTIVE' || params.status === 'CANCELLED') query.set('status', params.status);
  const [invoiceResult, clientsResult, aging] = await Promise.all([
    getApiData<PageResult<Invoice>>(`/invoices?${query.toString()}`),
    getApiData<PageResult<Client>>('/clients?page=1&limit=100'),
    getApiData<{
      buckets: Record<string, { amountAr: string; count: number }>;
      totalOpenAr: string;
    }>('/invoices/summary'),
  ]);
  if (!invoiceResult || !clientsResult || !aging) redirect('/login');

  return (
    <main className="min-h-screen bg-canvas p-6 text-navy">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">← Tableau de bord</Link>
            <h1 className="mt-2 text-3xl font-bold">Factures</h1>
            <p className="mt-1 text-slate-600">{currentUser.tenant?.name} · {invoiceResult.pagination.total} facture(s) affichée(s)</p>
          </div>
          <Link href="/clients" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Gérer les clients</Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Balance âgée">
          {[
            ['Non échues', aging.buckets.current],
            ['1–30 jours', aging.buckets.days1To30],
            ['31–60 jours', aging.buckets.days31To60],
            ['61–90 jours', aging.buckets.days61To90],
            ['Plus de 90 jours', aging.buckets.over90],
          ].map(([label, bucket]) => {
            const value = bucket as { amountAr: string; count: number };
            return (
              <article key={label as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-medium text-slate-600">{label as string}</h2>
                <p className="mt-2 text-lg font-bold">{formatAr(value.amountAr)}</p>
                <p className="mt-1 text-xs text-slate-500">{value.count} facture(s)</p>
              </article>
            );
          })}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Créer une facture</h2>
          <RefreshableInvoiceForm clients={clientsResult.items} />
        </section>

        <InvoiceImportForm />

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold">Liste des factures</h2>
            <form className="flex flex-wrap gap-2" role="search">
              <label className="sr-only" htmlFor="invoice-search">Rechercher une facture</label>
              <input id="invoice-search" name="search" defaultValue={params.search} placeholder="Numéro ou client" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <label className="sr-only" htmlFor="invoice-status">Filtrer par statut</label>
              <select id="invoice-status" name="status" defaultValue={params.status ?? ''} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">Tous les statuts</option><option value="ACTIVE">Active</option><option value="CANCELLED">Annulée</option>
              </select>
              <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">Filtrer</button>
            </form>
          </div>
          {invoiceResult.items.length === 0 ? (
            <p className="p-8 text-center text-slate-600">Aucune facture trouvée. Créez une facture ou modifiez les filtres.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3 font-medium">Facture</th><th className="px-5 py-3 font-medium">Client</th><th className="px-5 py-3 font-medium">Émise le</th><th className="px-5 py-3 font-medium">Échéance</th><th className="px-5 py-3 font-medium">Montant</th><th className="px-5 py-3 font-medium">Solde restant</th><th className="px-5 py-3 font-medium">Statut</th><th className="px-5 py-3 font-medium">Action</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {invoiceResult.items.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-5 py-3 font-medium">{invoice.number}</td><td className="px-5 py-3">{invoice.client.name}</td><td className="px-5 py-3">{invoice.issueDate}</td><td className="px-5 py-3">{invoice.dueDate}</td><td className="px-5 py-3">{formatAr(invoice.amountAr)}</td><td className="px-5 py-3 font-medium">{formatAr(invoice.remainingAr)}</td><td className="px-5 py-3">{invoice.status === 'ACTIVE' ? 'Active' : 'Annulée'}</td><td className="px-5 py-3">{invoice.status === 'ACTIVE' && (currentUser.role === 'ADMIN' || currentUser.role === 'FINANCE') ? <CancelInvoiceButton invoiceId={invoice.id} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
