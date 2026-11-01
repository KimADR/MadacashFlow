import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/session';
import { getApiData } from '../../lib/server-api';
import { RefreshableClientForm } from './refresh-button';

export const metadata: Metadata = { title: 'Clients | MadaCash Flow' };

type Client = {
  id: string;
  reference: string;
  name: string;
  email: string | null;
  phone: string | null;
};
type ClientList = {
  items: Client[];
  pagination: { page: number; pages: number; total: number };
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.tenantId) redirect('/login');
  const params = await searchParams;
  const query = new URLSearchParams({ page: params.page ?? '1', limit: '25' });
  if (params.search) query.set('search', params.search);
  const result = await getApiData<ClientList>(`/clients?${query.toString()}`);
  if (!result) redirect('/login');

  return (
    <main className="min-h-screen bg-canvas p-6 text-navy">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">← Tableau de bord</Link>
            <h1 className="mt-2 text-3xl font-bold">Clients</h1>
            <p className="mt-1 text-slate-600">{currentUser.tenant?.name} · {result.pagination.total} client(s)</p>
          </div>
          <Link href="/invoices" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Voir les factures</Link>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Ajouter un client</h2>
          <RefreshableClientForm />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold">Répertoire</h2>
            <form className="flex gap-2" role="search">
              <label className="sr-only" htmlFor="client-search">Rechercher un client</label>
              <input id="client-search" name="search" defaultValue={params.search} placeholder="Nom ou référence" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white">Rechercher</button>
            </form>
          </div>
          {result.items.length === 0 ? (
            <p className="p-8 text-center text-slate-600">Aucun client trouvé. Ajoutez-en un ou modifiez la recherche.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr><th className="px-5 py-3 font-medium">Référence</th><th className="px-5 py-3 font-medium">Entreprise</th><th className="px-5 py-3 font-medium">E-mail</th><th className="px-5 py-3 font-medium">Téléphone</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.items.map((client) => (
                    <tr key={client.id}>
                      <td className="px-5 py-3 font-medium">{client.reference}</td><td className="px-5 py-3">{client.name}</td><td className="px-5 py-3">{client.email ?? '—'}</td><td className="px-5 py-3">{client.phone ?? '—'}</td>
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
