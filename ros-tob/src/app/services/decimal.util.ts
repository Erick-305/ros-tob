// Acepta coma o punto como separador decimal (los inputs type=number solo aceptan punto).
export function parseDecimal(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}
