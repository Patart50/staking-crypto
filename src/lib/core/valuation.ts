/**
 * Valeur du staking dans la devise, jour par jour, avec l'historique réel des
 * cours pour la partie passée (D-021). Logique pure, testée.
 *
 * Avant aujourd'hui : cours de clôture Binance du jour. À partir d'aujourd'hui :
 * cours actuel, supposé constant (aucune prédiction). Le solde en jetons suit la
 * stratégie choisie (sans compound, ou la fréquence de l'utilisateur).
 */
import { D, type Dec } from 'commun-crypto/money';
import { addDays, daysBetween } from './dates';
import { balanceAt, DAYS_PER_YEAR, type StakingInput } from './staking';

export interface ValuePoint {
  /** Jours depuis le début. */
  day: number;
  date: string;
  price: Dec;
  /** Solde en jetons. */
  balance: Dec;
  /** Valeur du staking : solde × cours. */
  staking: Dec;
  /** Valeur des mêmes jetons sans staking : montant × cours. */
  hold: Dec;
}

export interface Snapshot {
  date: string;
  day: number;
  priceStart: Dec;
  price: Dec;
  balance: Dec;
  /** Valeur au départ : montant × cours du premier jour. */
  initialValue: Dec;
  stakingValue: Dec;
  holdValue: Dec;
  /** Part du résultat due aux rewards (nets de frais) : (solde − montant) × cours. */
  stakingEffect: Dec;
  /** Part due au cours : montant × (cours − cours de départ). */
  priceEffect: Dec;
}

export interface Valuation {
  points: ValuePoint[];
  /** Jours depuis le début jusqu'à aujourd'hui, si aujourd'hui est dans la durée (sinon null). */
  todayDay: number | null;
  /** Situation à aujourd'hui, ou à la fin si la durée est écoulée ; null si le staking commence aujourd'hui ou plus tard. */
  now: Snapshot | null;
  /** Le cours manque pour le début de la période (jeton coté plus tard) : premier jour avec un cours. */
  firstPriced: string | null;
}

/**
 * `history` : clôtures par date (null si non chargé) ; `current` : cours actuel
 * (saisi), utilisé pour aujourd'hui et la suite, et faute d'historique.
 */
export function valuation(
  input: StakingInput,
  perYear: number,
  start: string,
  todayDate: string,
  history: Map<string, Dec> | null,
  current: Dec | null,
  /** Cours au début (D-023), prioritaire sur la clôture du premier jour. */
  startPrice: Dec | null = null,
  maxPoints = 160,
): Valuation | null {
  const totalDays = input.years.times(DAYS_PER_YEAR).floor().toNumber();
  const elapsed = daysBetween(start, todayDate);
  let last: Dec | null = null;
  const priceOn = (day: number): Dec | null => {
    const date = addDays(start, day);
    if (day === 0 && startPrice && elapsed > 0) return startPrice;
    if (day < elapsed && history) {
      const p = history.get(date);
      if (p) last = p;
      return p ?? last;
    }
    return current ?? last;
  };

  // Jours à tracer : régulièrement espacés, plus aujourd'hui.
  const days = new Set<number>();
  const step = Math.max(1, totalDays / (maxPoints - 1));
  for (let i = 0; i * step < totalDays; i++) days.add(Math.round(i * step));
  days.add(totalDays);
  if (elapsed > 0 && elapsed < totalDays) days.add(elapsed);

  const points: ValuePoint[] = [];
  let firstPriced: string | null = null;
  for (const day of [...days].sort((a, b) => a - b)) {
    const price = priceOn(day);
    if (!price) continue;
    firstPriced ??= addDays(start, day);
    const balance = balanceAt(input, perYear, new D(day));
    points.push({ day, date: addDays(start, day), price, balance, staking: balance.times(price), hold: input.amount.times(price) });
  }
  if (!points.length) return null;

  let now: Snapshot | null = null;
  if (elapsed > 0) {
    const day = Math.min(elapsed, totalDays);
    const priceStart = startPrice ?? history?.get(start) ?? null;
    // Cours à la date retenue : clôture de la veille d'aujourd'hui pour le passé, cours actuel pour aujourd'hui.
    const price = day === elapsed ? current ?? priceOn(day - 1) : priceOn(day);
    if (priceStart && price) {
      const balance = balanceAt(input, perYear, new D(day));
      now = {
        date: addDays(start, day),
        day,
        priceStart,
        price,
        balance,
        initialValue: input.amount.times(priceStart),
        stakingValue: balance.times(price),
        holdValue: input.amount.times(price),
        stakingEffect: balance.minus(input.amount).times(price),
        priceEffect: input.amount.times(price.minus(priceStart)),
      };
    }
  }
  return { points, todayDay: elapsed > 0 && elapsed < totalDays ? elapsed : null, now, firstPriced: firstPriced === start ? null : firstPriced };
}
