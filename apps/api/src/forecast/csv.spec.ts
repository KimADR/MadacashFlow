import { csvRow, neutralizeCsvCell } from './csv';

describe('CSV formula neutralization', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1)', '  =1+1'])(
    'prefixes formula-like cell %s',
    (value) => {
      expect(neutralizeCsvCell(value)).toBe(`"'${value}"`);
    },
  );

  it('escapes quotes and preserves ordinary values', () => {
    expect(csvRow(['Client "A"', '3 000 000'])).toBe(
      '"Client ""A""","3 000 000"',
    );
  });
});
