// Speech recognisers often return digits ("Tengo 5 años"). For scoring we spell them out.

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 0–999_999 → Spanish words; returns null outside range. */
export function numberToSpanish(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return null;
  if (n < 30) return UNITS[n]!;
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    return u === 0 ? TENS[t]! : `${TENS[t]} y ${UNITS[u]}`;
  }
  if (n === 100) return 'cien';
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return r === 0 ? HUNDREDS[h]! : `${HUNDREDS[h]} ${numberToSpanish(r)}`;
  }
  const th = Math.floor(n / 1000), r = n % 1000;
  const head = th === 1 ? 'mil' : `${numberToSpanish(th)} mil`;
  return r === 0 ? head : `${head} ${numberToSpanish(r)}`;
}
