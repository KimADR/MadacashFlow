export default function HealthPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">État système</p>
        <h1 className="mt-3 text-3xl font-bold text-navy">MadaCash Flow</h1>
        <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-700">
          <strong>OK</strong> — front web prêt pour la vérification locale.
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Cette page sert d’état de santé visuel pendant l’initialisation du projet.
        </p>
      </div>
    </main>
  );
}
