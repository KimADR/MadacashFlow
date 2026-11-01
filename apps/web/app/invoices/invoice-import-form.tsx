'use client';

import { ChangeEvent, FormEvent, useState } from 'react';

const FIELD_LABELS = [
  ['clientRefColumn', 'Référence client'],
  ['numberColumn', 'Numéro de facture'],
  ['issueDateColumn', 'Date de facture'],
  ['dueDateColumn', 'Date d’échéance'],
  ['amountArColumn', 'Montant en ariary'],
] as const;
type MappingKey = (typeof FIELD_LABELS)[number][0];
type Mapping = Record<MappingKey, string>;
type Preview = {
  previewId: string;
  validCount: number;
  rejectedCount: number;
  rows: Array<{
    row: number;
    clientReference: string;
    clientName: string;
    number: string;
    issueDate: string;
    dueDate: string;
    amountAr: string;
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
    numberColumn: 'number',
    issueDateColumn: 'issueDate',
    dueDateColumn: 'dueDate',
    amountArColumn: 'amountAr',
  };
  const used = new Set<string>();
  const mapping = {} as Mapping;
  for (const [key] of FIELD_LABELS) {
    const match = headers.find((header) => header === preferred[key] && !used.has(header));
    const column = match ?? headers.find((header) => !used.has(header)) ?? '';
    mapping[key] = column;
    if (column) used.add(column);
  }
  return mapping;
}

async function requestCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Impossible de préparer l’import.');
  const result: { csrfToken: string } = await response.json();
  return result.csrfToken;
}

export function InvoiceImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({
    clientRefColumn: '',
    numberColumn: '',
    issueDateColumn: '',
    dueDateColumn: '',
    amountArColumn: '',
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
    for (const [key] of FIELD_LABELS) formData.append(key, mapping[key]);
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
      const response = await fetch('/api/v1/imports/invoices/preview', {
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
      const response = await fetch('/api/v1/imports/invoices/commit', {
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
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">Importer des factures CSV</h2>
      <p className="mt-1 text-sm text-slate-600">Format UTF-8, maximum 1 Mo et 5 000 lignes. L’aperçu ne crée aucune facture.</p>
      <form className="mt-4 space-y-4" onSubmit={submitPreview}>
        <label className="block text-sm font-medium" htmlFor="invoice-csv">
          Fichier CSV
          <input id="invoice-csv" type="file" accept=".csv,text/csv" onChange={handleFileChange} className="mt-2 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-medium file:text-primary" />
        </label>
        {headers.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELD_LABELS.map(([key, label]) => (
              <label key={key} className="text-sm font-medium" htmlFor={`mapping-${key}`}>
                {label}
                <select
                  id={`mapping-${key}`}
                  value={mapping[key]}
                  required
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [key]: event.target.value }));
                    setPreview(null);
                  }}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Choisir une colonne</option>
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
      {preview && (
        <div className="mt-5 space-y-4" aria-live="polite">
          <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
            {preview.validCount} ligne(s) prête(s) · {preview.rejectedCount} rejet(s). Les rejets seront conservés dans le résumé.
          </p>
          {preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b text-slate-600"><th className="py-2 pr-3">Ligne</th><th className="py-2 pr-3">Client</th><th className="py-2 pr-3">Facture</th><th className="py-2 pr-3">Échéance</th><th className="py-2">Montant (Ar)</th></tr></thead>
                <tbody>{preview.rows.slice(0, 20).map((row) => <tr key={`${row.row}-${row.number}`} className="border-b border-slate-100"><td className="py-2 pr-3">{row.row}</td><td className="py-2 pr-3">{row.clientName} ({row.clientReference})</td><td className="py-2 pr-3">{row.number}</td><td className="py-2 pr-3">{row.dueDate}</td><td className="py-2">{new Intl.NumberFormat('fr-FR').format(BigInt(row.amountAr))}</td></tr>)}</tbody>
              </table>
              {preview.rows.length > 20 && <p className="mt-2 text-xs text-slate-500">Aperçu limité aux 20 premières lignes valides.</p>}
            </div>
          )}
          {preview.rejectedRows.length > 0 && (
            <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-950">
              <h3 className="font-semibold">Lignes rejetées</h3>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {preview.rejectedRows.slice(0, 20).map((row) => <li key={row.row}>Ligne {row.row} : {row.messages.join(' ')}</li>)}
              </ul>
              {preview.rejectedRows.length > 20 && <p className="mt-2">Les autres rejets seront inclus dans le résumé d’import.</p>}
            </div>
          )}
          <button type="button" onClick={commitImport} disabled={isLoading || preview.validCount === 0} className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {isLoading ? 'Import…' : 'Confirmer l’import'}
          </button>
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-950" role="status">
          <p className="font-semibold">{result.createdCount} facture(s) importée(s), {result.rejectedCount} rejet(s).</p>
          {result.idempotent && <p>Ce fichier avait déjà été importé ; aucune facture supplémentaire n’a été créée.</p>}
          {result.rejectedRows.length > 0 && (
            <ul className="mt-2 list-inside list-disc">
              {result.rejectedRows.slice(0, 20).map((row) => <li key={row.row}>Ligne {row.row} : {row.messages.join(' ')}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
