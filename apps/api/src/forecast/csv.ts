export function neutralizeCsvCell(value: string): string {
  const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function csvRow(values: string[]): string {
  return values.map(neutralizeCsvCell).join(',');
}
