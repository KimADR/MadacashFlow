import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getApiData } from '../../lib/server-api';
import { getCurrentUser } from '../../lib/session';
import { PaymentManagement } from './payment-management';

export const metadata: Metadata = { title: 'Paiements | MadaCash Flow' };

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
type PageResult<T> = {
  items: T[];
  pagination: { page: number; pages: number; total: number };
};

export default async function PaymentsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser?.tenantId) redirect('/login');

  const [clients, invoices, payments] = await Promise.all([
    getApiData<PageResult<Client>>('/clients?page=1&limit=100'),
    getApiData<PageResult<Invoice>>('/invoices?page=1&limit=100&status=ACTIVE'),
    getApiData<PageResult<Payment>>('/payments?page=1&limit=50'),
  ]);
  if (!clients || !invoices || !payments) redirect('/login');

  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'FINANCE';

  return (
    <main className="min-h-screen bg-canvas p-6 text-navy">
      <section className="mx-auto max-w-6xl space-y-6">
        <header>
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
            ← Tableau de bord
          </Link>
          <h1 className="mt-2 text-3xl font-bold">Paiements</h1>
          <p className="mt-1 text-slate-600">{currentUser.tenant?.name}</p>
        </header>
        <PaymentManagement
          clients={clients.items}
          invoices={invoices.items}
          payments={payments.items}
          canManage={canManage}
        />
      </section>
    </main>
  );
}
