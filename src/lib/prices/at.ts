/**
 * Cours d'un jeton à une date et une heure (heure de Paris), via les bougies
 * d'une minute de Binance (`commun-crypto/klines`, commun D-010), après
 * consentement (D-015). Envoyé : noms de paires et instant, jamais de montant.
 *
 * Chemins (D-023), comme l'historique journalier (D-021) :
 *   dollars : XUSDC ; sinon XUSDT ÷ USDCUSDT ; sinon XUSDT (USDT assimilé au dollar).
 *   euros   : XEUR ; sinon XUSDT ÷ EURUSDT.
 * USDC en dollars : 1, sans appel.
 */
import { MinuteKlines } from 'commun-crypto/klines';
import type { Currency } from 'commun-crypto/currency';
import { D, type Dec } from 'commun-crypto/money';

export interface PriceAt {
  price: Dec;
  route: string;
}

type Close = (symbol: string, utcMs: number) => Promise<Dec | null>;

/** Cours au plus près de l'instant ; null si aucun chemin n'a de bougie à moins d'une heure. */
export async function priceAt(close: Close, asset: string, currency: Currency, utcMs: number): Promise<PriceAt | null> {
  const a = asset.trim().toUpperCase();
  if (currency === 'USD' && a === 'USDC') return { price: new D(1), route: 'USDC = 1 $' };
  if (currency === 'USD') {
    const usdc = await close(`${a}USDC`, utcMs);
    if (usdc) return { price: usdc, route: `${a}USDC` };
    const usdt = await close(`${a}USDT`, utcMs);
    if (!usdt) return null;
    const usdcUsdt = await close('USDCUSDT', utcMs);
    return usdcUsdt ? { price: usdt.div(usdcUsdt), route: `${a}USDT ÷ USDCUSDT` } : { price: usdt, route: `${a}USDT` };
  }
  const eur = await close(`${a}EUR`, utcMs);
  if (eur) return { price: eur, route: `${a}EUR` };
  const [usdt, eurUsdt] = await Promise.all([close(`${a}USDT`, utcMs), close('EURUSDT', utcMs)]);
  return usdt && eurUsdt ? { price: usdt.div(eurUsdt), route: `${a}USDT ÷ EURUSDT` } : null;
}

/** Bougies d'une minute partagées par l'application (cache et liste des paires). */
export const minuteKlines = new MinuteKlines();
