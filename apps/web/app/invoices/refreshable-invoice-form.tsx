'use client';

import { useRouter } from 'next/navigation';
import { InvoiceForm } from './invoice-form';

type ClientOption = { id: string; reference: string; name: string };

export function RefreshableInvoiceForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  return <InvoiceForm clients={clients} onCreated={() => router.refresh()} />;
}
