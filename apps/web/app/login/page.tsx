import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Connexion | MadaCash Flow',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">MadaCash Flow</p>
        <h1 className="mt-3 text-3xl font-bold text-navy">Connexion</h1>
        <p className="mt-2 text-sm text-slate-600">Connectez-vous à votre espace professionnel.</p>
        <LoginForm />
      </section>
    </main>
  );
}
