/**
 * Historique des cours journaliers d'un jeton, en dollars (USDC) ou en euros,
 * via l'API publique de Binance (bougies d'un jour, clôture UTC). Appelé
 * seulement après consentement (D-015, D-021). Ce qui est envoyé : des noms de
 * paires et des dates, jamais de montant.
 *
 * Requêtes et pagination reprises de dca-crypto (commit 50ce806,
 * src/lib/prices/binance.ts, `BinanceDaily`) : liste des paires chargée une
 * fois, seules les paires existantes sont interrogées (une paire inconnue
 * répond sans en-tête CORS), deux hôtes.
 *
 * Chemins, pour chaque jour (D-021) :
 *   dollars : XUSDC ; sinon XUSDT ÷ USDCUSDT ; sinon XUSDT (USDT assimilé au dollar).
 *   euros   : XEUR ; sinon XUSDT ÷ EURUSDT.
 * Un jour sans cours reprend le dernier cours connu ; avant la première
 * cotation, pas de cours.
 */
import { HOSTS, PriceFetchError, type Fetcher } from 'commun-crypto/binance';
import { D, dec, type Dec } from 'commun-crypto/money';
import type { Currency } from 'commun-crypto/currency';
import { dateToUtcMs, DAY_MS, eachDay, utcMsToDate } from '../core/dates';

const LIMIT = 1000;

export type Route = 'USDC' | 'USDT/USDCUSDT' | 'USDT' | 'EUR' | 'USDT/EURUSDT' | 'fixe';

export interface PriceHistory {
  asset: string;
  currency: Currency;
  from: string;
  to: string;
  /** Clôture journalière dans la devise, par date (jours sans bougie complétés par le dernier cours connu). */
  prices: Map<string, Dec>;
  /** Chemin le plus utilisé, pour l'affichage. */
  route: Route | null;
  /** Première date avec un cours (null si aucune). */
  first: string | null;
}

export class BinanceDaily {
  private symbolList: Promise<Set<string>> | null = null;
  private host = 0;

  constructor(private readonly fetcher: Fetcher = (url) => fetch(url)) {}

  symbols(): Promise<Set<string>> {
    if (!this.symbolList) {
      this.symbolList = this.loadSymbols();
      this.symbolList.catch(() => (this.symbolList = null));
    }
    return this.symbolList;
  }

  private async loadSymbols(): Promise<Set<string>> {
    const data = (await this.get('/api/v3/ticker/price')) as { symbol: string }[];
    if (!Array.isArray(data) || data.length === 0) throw new PriceFetchError('Liste des paires Binance vide.');
    return new Set(data.map((d) => d.symbol));
  }

  private async get(path: string): Promise<unknown> {
    let lastStatus = 0;
    for (let attempt = 0; attempt < HOSTS.length; attempt++) {
      const index = (this.host + attempt) % HOSTS.length;
      try {
        const res = await this.fetcher(`${HOSTS[index]}${path}`);
        if (!res.ok) {
          lastStatus = res.status;
          continue;
        }
        this.host = index;
        return await res.json();
      } catch {
        // hôte suivant
      }
    }
    throw new PriceFetchError(
      lastStatus ? `Binance a répondu avec une erreur (HTTP ${lastStatus}).` : 'Impossible de joindre Binance (connexion coupée ou accès bloqué par le navigateur).',
    );
  }

  /** Clôtures journalières d'une paire entre deux dates incluses (vide si la paire n'existe pas). */
  async closes(symbol: string, from: string, to: string): Promise<Map<string, Dec>> {
    const out = new Map<string, Dec>();
    if (!(await this.symbols()).has(symbol)) return out;
    const end = dateToUtcMs(to) + DAY_MS - 1;
    let start = dateToUtcMs(from);
    while (start <= end) {
      const candles = (await this.get(`/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${start}&endTime=${end}&limit=${LIMIT}`)) as unknown[][];
      if (!Array.isArray(candles) || candles.length === 0) break;
      for (const c of candles) {
        try {
          const close = dec(String(c[4]));
          if (close.gt(0)) out.set(utcMsToDate(Number(c[0])), close);
        } catch {
          // bougie illisible : jour sans cours
        }
      }
      const lastOpen = Number(candles[candles.length - 1][0]);
      if (candles.length < LIMIT || !Number.isFinite(lastOpen)) break;
      start = lastOpen + DAY_MS;
    }
    return out;
  }

  /** Historique d'un jeton dans la devise, de `from` à `to` inclus. */
  async history(asset: string, currency: Currency, from: string, to: string): Promise<PriceHistory> {
    const a = asset.trim().toUpperCase();
    if (currency === 'USD' && a === 'USDC') return fixedHistory(a, currency, from, to);
    if (currency === 'USD') {
      const [usdc, usdt, usdcUsdt] = await Promise.all([this.closes(`${a}USDC`, from, to), this.closes(`${a}USDT`, from, to), this.closes('USDCUSDT', from, to)]);
      return combine(a, currency, from, to, [
        ['USDC', (d) => usdc.get(d)],
        ['USDT/USDCUSDT', (d) => div(usdt.get(d), usdcUsdt.get(d))],
        ['USDT', (d) => usdt.get(d)],
      ]);
    }
    const [eur, usdt, eurUsdt] = await Promise.all([this.closes(`${a}EUR`, from, to), this.closes(`${a}USDT`, from, to), this.closes('EURUSDT', from, to)]);
    return combine(a, currency, from, to, [
      ['EUR', (d) => eur.get(d)],
      ['USDT/EURUSDT', (d) => div(usdt.get(d), eurUsdt.get(d))],
    ]);
  }
}

function div(a: Dec | undefined, b: Dec | undefined): Dec | undefined {
  return a && b ? a.div(b) : undefined;
}

function fixedHistory(asset: string, currency: Currency, from: string, to: string): PriceHistory {
  const prices = new Map(eachDay(from, to).map((d) => [d, new D(1)] as const));
  return { asset, currency, from, to, prices, route: 'fixe', first: from };
}

/**
 * Combine les chemins jour par jour (fonction pure, testée) : premier chemin
 * qui a un cours ; un jour sans cours reprend le dernier connu.
 */
export function combine(asset: string, currency: Currency, from: string, to: string, routes: [Route, (date: string) => Dec | undefined][]): PriceHistory {
  const prices = new Map<string, Dec>();
  const counts = new Map<Route, number>();
  let last: Dec | undefined;
  let first: string | null = null;
  for (const date of eachDay(from, to)) {
    let price: Dec | undefined;
    for (const [route, get] of routes) {
      price = get(date);
      if (price) {
        counts.set(route, (counts.get(route) ?? 0) + 1);
        break;
      }
    }
    price ??= last;
    if (!price) continue;
    first ??= date;
    prices.set(date, price);
    last = price;
  }
  let route: Route | null = null;
  for (const [r, n] of counts) if (!route || n > (counts.get(route) ?? 0)) route = r;
  return { asset, currency, from, to, prices, route, first };
}
