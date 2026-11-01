'use client';

import { useRouter } from 'next/navigation';
import { ClientForm } from './client-form';

export function RefreshableClientForm() {
  const router = useRouter();
  return <ClientForm onCreated={() => router.refresh()} />;
}
