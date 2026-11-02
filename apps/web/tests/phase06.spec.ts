import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const apiURL = 'http://127.0.0.1:3211';
const clientId = '00000000-0000-4000-8000-000000000001';
const invoiceId = '00000000-0000-4000-8000-000000000003';

async function resetApi(request: APIRequestContext) {
  await request.post(`${apiURL}/__test/reset`);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill('finance@example.test');
  await page.getByLabel('Mot de passe').fill('fictional-test-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByLabel('Entreprise').selectOption('00000000-0000-4000-8000-000000000002');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ request }) => {
  await resetApi(request);
});

test('login and import a CSV invoice', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Factures et balance âgée' }).click();
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
  await page.getByLabel('Fichier CSV').setInputFiles({
    name: 'factures-demo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'clientRef,number,issueDate,dueDate,amountAr\nCLIENT-DEMO,FAC-IMPORT-001,2026-10-01,2026-11-15,1250000',
    ),
  });
  await page.getByRole('button', { name: 'Prévisualiser' }).click();
  await expect(page.getByText(/1 ligne\(s\) prête\(s\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmer l’import' }).click();
  await expect(page.getByRole('status')).toContainText('1 facture(s) importée(s)');
});

test('loads dashboard and forecast when no opening balance is configured', async ({
  page,
}) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /Bonjour,/ })).toBeVisible();
  await expect(page.getByText('À configurer')).toBeVisible();
  await page.goto('/forecast');
  await expect(
    page.getByRole('heading', { name: 'Prévision de trésorerie', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Solde de départ' }),
  ).toBeVisible();
});

test('records, confirms, and partially allocates a payment', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Paiements' }).click();
  await page.getByRole('combobox', { name: 'Client' }).selectOption(clientId);
  await page.getByLabel('Montant reçu (ariary entiers)').fill('1000000');
  await page.getByLabel('Date de réception').fill('2026-11-01');
  await page.getByRole('button', { name: 'Enregistrer en attente' }).click();
  await expect(page.getByText('Paiement enregistré en attente de confirmation.')).toBeVisible();
  const payment = page.locator('article').filter({ hasText: '1 000 000 Ar' }).first();
  await payment.getByRole('button', { name: 'Confirmer le paiement' }).click();
  await expect(payment.getByText('Confirmé')).toBeVisible();
  await payment.getByLabel('Facture du même client').selectOption(invoiceId);
  await payment.getByLabel('Montant à affecter (Ar)').fill('1000000');
  await payment.getByRole('button', { name: 'Affecter' }).click();
  await expect(page.getByText('Paiement affecté à la facture.')).toBeVisible();
  await page.getByRole('link', { name: 'Tableau de bord' }).click();
  await page.getByRole('link', { name: 'Factures et balance âgée' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'FAC-DEMO-001' }),
  ).toContainText('2 000 000 Ar');
});

test('records a promise and opens a dispute in the collection queue', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Recouvrement' }).click();
  const invoice = page.locator('article').filter({ hasText: 'FAC-DEMO-001' });
  await invoice.getByLabel('Date promise').fill('2026-11-10');
  await invoice.getByLabel('Montant promis (Ar)').fill('750000');
  await invoice.getByRole('button', { name: 'Enregistrer la promesse' }).click();
  await expect(page.getByText(/Promesse : .* pour le 2026-11-10/)).toBeVisible();
  await invoice.getByPlaceholder('Motif du litige').fill('Vérification de facture demandée');
  await invoice.getByRole('button', { name: 'Ouvrir le litige et suspendre le suivi' }).click();
  await expect(invoice.getByText('Litige ouvert')).toBeVisible();
  await expect(invoice.getByText('Motif du litige : Vérification de facture demandée')).toBeVisible();
  await expect(invoice.getByRole('button', { name: 'Journaliser la relance' })).toHaveCount(0);
});

test('@a11y login, invoices, payments and collections have no WCAG 2 A/AA violations', async ({
  page,
}) => {
  await page.goto('/login');
  const loginScan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(loginScan.violations).toEqual([]);

  await login(page);
  for (const [route, linkName] of [
    ['/invoices', 'Factures et balance âgée'],
    ['/payments', 'Paiements'],
    ['/collections', 'Recouvrement'],
  ] as const) {
    await page.goto(route);
    await expect(page.getByRole('main')).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations, `${linkName} accessibility violations`).toEqual([]);
  }
});
