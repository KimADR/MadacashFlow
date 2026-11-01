'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const FIELD_LABELS = [
  ['clientRefColumn', 'Référence client', true],
  ['amountArColumn', 'Montant en ariary', true],
  ['receivedAtColumn', 'Date de réception', true],
  ['methodColumn', 'Mode (code)', true],
  ['referenceColumn', 'Référence de paiement (facultative)', false],
] as const;
type MappingKey = (typeof FIELD_LABELS)[number][0];
type Mapping = Record<MappingKey, string>;
type Preview = {
  validCount: number;
  rejectedCount: number;
  rows: Array<{
    row: number;
    clientReference: string;
    clientName: string;
    amountAr: string;
    receivedAt: string;
    method: string;
    reference: string | null;
  }>;
  rejectedRows: Array<{ row: number; messages: string[] }>;
};
type CommitResult = {
  createdCount: number;
  rejectedCount: number;
  rejectedRows: Array<{ row: number; messages: string[] }>;
  idempotent: boolean;
};

function parseHeader(firstLine: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  const line = firstLine.replace(/^\uFEFF/, '');
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  values.push(value.trim());
  return values;
}

function createDefaultMapping(headers: string[]): Mapping {
  const preferred: Record<MappingKey, string> = {
    clientRefColumn: 'clientRef',
    amountArColumn: 'amountAr',
    receivedAtColumn: 'receivedAt',
    methodColumn: 'method',
    referenceColumn: 'reference',
  };
  const used = new Set<string>();
  const mapping = {} as Mapping;
  for (const [key] of FIELD_LABELS) {
    const match = headers.find((header) => header === preferred[key] && !used.has(header));
    const column = match ?? (key === 'referenceColumn' ? '' : headers.find((header) => !used.has(header)) ?? '');
    mapping[key] = column;
    if (column) used.add(column);
  }
  return mapping;
}

function formatAr(amountAr: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(BigInt(amountAr))} Ar`;
}

async function requestCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de préparer l’import.');
  const result: { csrfToken: string } = await response.json();
  return result.csrfToken;
}

export function PaymentImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    clientRefColumn: '',
    amountArColumn: '',
    receivedAtColumn: '',
    methodColumn: '',
    referenceColumn: '',
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError('');
    if (!selected) {
      setHeaders([]);
      return;
    }
    if (selected.size > 1_000_000) {
      setError('Le fichier dépasse la limite de 1 Mo.');
      setFile(null);
      setHeaders([]);
      return;
    }
    const firstLine = (await selected.text()).split(/\r\n|\n|\r/, 1)[0] ?? '';
    const parsedHeaders = parseHeader(firstLine);
    setHeaders(parsedHeaders);
    setMapping(createDefaultMapping(parsedHeaders));
  }

  function createFormData(selectedFile: File): FormData {
    const formData = new FormData();
    formData.append('file', selectedFile);
    for (const [key, , required] of FIELD_LABELS) {
      if (required || mapping[key]) formData.append(key, mapping[key]);
    }
    return formData;
  }

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setError('');
    setResult(null);
    setIsLoading(true);
    try {
      const csrfToken = await requestCsrfToken();
      const response = await fetch('/api/v1/imports/payments/preview', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
        body: createFormData(file),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message ?? 'Aperçu impossible.');
      }
      setPreview(body as Preview);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  async function commitImport() {
    if (!file || !preview || preview.validCount === 0) return;
    setError('');
    setIsLoading(true);
    try {
      const csrfToken = await requestCsrfToken();
      const response = await fetch('/api/v1/imports/payments/commit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
        body: createFormData(file),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message ?? 'Import impossible.');
      }
      setResult(body as CommitResult);
      setPreview(null);
      setFile(null);
      setHeaders([]);
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Importer des paiements CSV</h2>
      <p className="mt-1 text-sm text-slate-600">
        UTF-8, maximum 1 Mo et 5 000 lignes. L’aperçu n’écrit rien ; l’import crée uniquement des paiements en attente.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Colonnes requises : clientRef, amountAr, receivedAt (AAAA-MM-JJ), method (CASH, BANK_TRANSFER, MOBILE_MONEY, CHEQUE, OTHER). Référence facultative.
      </p>
      <form className="mt-4 space-y-4" onSubmit={submitPreview}>
        <label className="block text-sm font-medium" htmlFor="payment-csv">
          Fichier CSV
          <input id="payment-csv" type="file" accept=".csv,text/csv" onChange={handleFileChange} className="mt-2 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-medium file:text-primary" />
        </label>
        {headers.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map(([key, label, required]) => (
              <label key={key} className="text-sm font-medium" htmlFor={`payment-mapping-${key}`}>
                {label}
                <select
                  id={`payment-mapping-${key}`}
                  value={mapping[key]}
                  required={required}
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [key]: event.target.value }));
                    setPreview(null);
                  }}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">{required ? 'Choisir une colonne' : 'Aucune'}</option>
                  {headers.map((header, index) => <option key={`${header}-${index}`} value={header}>{header || `Colonne ${index + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        {headers.length > 0 && (
          <button type="submit" disabled={!file || isLoading} className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {isLoading ? 'Analyse…' : 'Prévisualiser'}
          </button>
        )}
      </form>

      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
      {result && (
        <p className="mt-4 text-sm text-green-800" role="status">
          {result.idempotent ? 'Ce fichier avait déjà été importé.' : 'Import terminé.'} {result.createdCount} paiement(s) en attente créé(s), {result.rejectedCount} ligne(s) rejetée(s). Aucun paiement n’a été confirmé ni affecté.
        </p>
      )}
      {preview && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <p className="text-sm font-medium">
            Aperçu : {preview.validCount} ligne(s) valide(s), {preview.rejectedCount} rejetée(s).
          </p>
          {preview.rows.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Ligne</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Montant</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Référence</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.slice(0, 20).map((row) => (
                    <tr key={row.row}><td className="px-3 py-2">{row.row}</td><td className="px-3 py-2">{row.clientName} ({row.clientReference})</td><td className="px-3 py-2">{formatAr(row.amountAr)}</td><td className="px-3 py-2">{row.receivedAt}</td><td className="px-3 py-2">{row.method}</td><td className="px-3 py-2">{row.reference ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 20 && <p className="p-2 text-xs text-slate-500">Les 20 premières lignes valides sont affichées.</p>}
            </div>
          )}
          {preview.rejectedRows.length > 0 && (
            <ul className="space-y-1 text-sm text-red-800">
              {preview.rejectedRows.slice(0, 20).map((row) => <li key={row.row}>Ligne {row.row} : {row.messages.join(' ')}</li>)}
              {preview.rejectedRows.length > 20 && <li>… et {preview.rejectedRows.length - 20} autre(s) ligne(s) rejetée(s).</li>}
            </ul>
          )}
          <button type="button" onClick={commitImport} disabled={isLoading || preview.validCount === 0} className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {isLoading ? 'Import…' : `Importer ${preview.validCount} paiement(s) en attente`}
          </button>
        </div>
      )}
    </section>
  );
}
