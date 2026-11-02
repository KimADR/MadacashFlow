import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getApiData, formatAr } from '../../lib/server-api';
import { getCurrentUser } from '../../lib/session';
import { ForecastControls } from './forecast-controls';

export const metadata: Metadata = {
  title: 'Prévision de trésorerie | MadaCash Flow',
};

type OpeningBalance = {
  id: string;
  asOfDate: string;
  amountAr: string;
  updatedAt: string;
};
type ForecastExpense = {
  id: string;
  description: string;
  plannedDate: string;
  amountAr: string;
  status: 'PLANNED' | 'CANCELLED';
};
type ExpensePage = {
  items: ForecastExpense[];
  pagination: { page: number; pages: number; total: number };
};
type ForecastWeek = {
  week: number;
  startDate: string;
  endDate: string;
  actualReceiptsAr: string;
  expectedReceivablesAr: string;
  promisedReceivablesAr: string;
  expectedExpensesAr: string;
  expectedClosingBalanceAr: string;
  prudentClosingBalanceAr: string;
};
type ForecastResponse = {
  configured: boolean;
  openingBalance: OpeningBalance | null;
  forecast: {
    asOfDate: string;
    openingBalanceAr: string;
    openReceivablesAr: string;
    disputedReceivablesAr: string;
    weeks: ForecastWeek[];
  } | null;
};

function madagascarToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Indian/Antananarivo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ expensesPage?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.tenantId) redirect('/login');
  if (
    currentUser.role !== 'ADMIN' &&
    currentUser.role !== 'FINANCE' &&
    currentUser.role !== 'VIEWER'
  ) {
    redirect('/dashboard');
  }
  const params = await searchParams;
  const requestedPage = Number(params.expensesPage ?? '1');
  const expensesPage =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const [openingBalanceResult, expenses] = await Promise.all([
    getApiData<{ openingBalance: OpeningBalance | null }>(
      '/forecast/opening-balance',
    ),
    getApiData<ExpensePage>(
      `/forecast/expenses?status=PLANNED&page=${expensesPage}&limit=100`,
    ),
  ]);
  if (openingBalanceResult === null || expenses === null) redirect('/login');
  const openingBalance = openingBalanceResult.openingBalance;
  if (
    expenses.pagination.pages > 0 &&
    expensesPage > expenses.pagination.pages
  ) {
    redirect(`/forecast?expensesPage=${expenses.pagination.pages}`);
  }
  const projection = openingBalance
    ? await getApiData<ForecastResponse>('/forecast')
    : null;
  if (openingBalance && !projection) redirect('/login');
  const today = openingBalance?.asOfDate ?? madagascarToday();
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
            <h1 className="mt-2 text-3xl font-bold">Prévision de trésorerie</h1>
            <p className="mt-1 text-slate-600">
              {currentUser.tenant?.name} · projection sur 13 semaines
            </p>
          </div>
          <Link
            href="/api/v1/reports/aging.csv"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Télécharger la balance âgée CSV
          </Link>
        </header>

        <p className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Cette projection est une aide au pilotage, pas une garantie
          d’encaissement. Les scénarios dépendent des dates et hypothèses
          enregistrées par votre entreprise.
        </p>

        <ForecastControls
          openingBalance={openingBalance}
          today={today}
          tomorrow={addCalendarDays(madagascarToday(), 1)}
          lastForecastDay={addCalendarDays(madagascarToday(), 91)}
          expenses={expenses.items}
          canManage={canManage}
        />

        {projection?.forecast ? (
          <>
            <section
              className="grid gap-3 sm:grid-cols-3"
              aria-label="Résumé de la prévision"
            >
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-medium text-slate-600">
                  Solde de départ au {projection.forecast.asOfDate}
                </h2>
                <p className="mt-2 text-lg font-bold">
                  {formatAr(projection.forecast.openingBalanceAr)}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-medium text-slate-600">
                  Créances ouvertes à la date de départ
                </h2>
                <p className="mt-2 text-lg font-bold">
                  {formatAr(projection.forecast.openReceivablesAr)}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xs font-medium text-slate-600">
                  Créances en litige exclues des encaissements projetés
                </h2>
                <p className="mt-2 text-lg font-bold">
                  {formatAr(projection.forecast.disputedReceivablesAr)}
                </p>
              </article>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5">
                <h2 className="text-lg font-semibold">
                  Évolution hebdomadaire
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Les encaissements confirmés, créances attendues, promesses et
                  dépenses sont affichés séparément. Les deux soldes de clôture
                  correspondent aux scénarios attendu et prudent.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Semaine
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Encaissements confirmés
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Créances attendues
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Promesses (non encaissées)
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Dépenses prévues
                      </th>
                      <th
                        scope="col"
                        className="bg-blue-50 px-4 py-3 font-semibold text-blue-950"
                      >
                        Solde attendu
                      </th>
                      <th
                        scope="col"
                        className="bg-amber-50 px-4 py-3 font-semibold text-amber-950"
                      >
                        Solde prudent
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projection.forecast.weeks.map((week) => (
                      <tr key={week.week}>
                        <th scope="row" className="px-4 py-3 font-medium">
                          {week.week} · {week.startDate} – {week.endDate}
                        </th>
                        <td className="px-4 py-3">
                          {formatAr(week.actualReceiptsAr)}
                        </td>
                        <td className="px-4 py-3">
                          {formatAr(week.expectedReceivablesAr)}
                        </td>
                        <td className="px-4 py-3">
                          {formatAr(week.promisedReceivablesAr)}
                        </td>
                        <td className="px-4 py-3">
                          {formatAr(week.expectedExpensesAr)}
                        </td>
                        <td className="bg-blue-50/60 px-4 py-3 font-semibold">
                          {formatAr(week.expectedClosingBalanceAr)}
                        </td>
                        <td className="bg-amber-50/60 px-4 py-3 font-semibold">
                          {formatAr(week.prudentClosingBalanceAr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            Aucun solde de départ n’a encore été enregistré pour aujourd’hui. La
            projection reste désactivée jusqu’à sa saisie ; aucun solde nul
            n’est supposé.
          </p>
        )}

        {expenses.pagination.pages > 1 && (
          <nav
            className="flex items-center justify-between"
            aria-label="Pagination des dépenses prévues"
          >
            {expensesPage > 1 ? (
              <Link
                href={`/forecast?expensesPage=${expensesPage - 1}`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50"
              >
                ← Précédent
              </Link>
            ) : (
              <span />
            )}
            <span className="text-sm text-slate-600">
              Dépenses {expenses.pagination.total} · page {expensesPage} sur{' '}
              {expenses.pagination.pages}
            </span>
            {expensesPage < expenses.pagination.pages ? (
              <Link
                href={`/forecast?expensesPage=${expensesPage + 1}`}
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
