import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas text-navy">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Socle initial
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            MadaCash Flow
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Plateforme métier de gestion des créances, des encaissements et des échéances pour PME B2B.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/health"
              className="inline-flex items-center rounded-md bg-primary px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Voir l’état /health
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
