/**
 * Moteur de calcul du rendement de staking (SPEC § 3, D-002 à D-004, D-006, D-010).
 *
 * Toute la simulation se fait en jetons (D-014) : les frais fixes saisis dans la
 * devise sont convertis en jetons avant d'arriver ici. Aucun `number` pour un
 * montant : decimal.js, précision 50, aucun arrondi intermédiaire.
 *
 * Notations : M montant staké, e frais d'entrée, s frais de sortie, g frais par
 * compound, c commission, k compounds par an, T durée en années.
 * q = APR × (1 − c) ÷ k est le reward net d'une période, par jeton staké.
 */
import { D, type Dec } from 'commun-crypto/money';

/** Jours dans une année (D-003). */
export const DAYS_PER_YEAR = 365;
/** Fréquences nommées : compounds par an (D-003). */
export const FREQUENCIES = { daily: 365, weekly: 52, monthly: 12 } as const;
/** Durée maximale acceptée, en années (SPEC § 2). */
export const MAX_YEARS = 50;

export type RateType = 'APR' | 'APY';
export type DurationUnit = 'days' | 'months' | 'years';

export interface StakingInput {
  /** Montant staké, en jetons. */
  amount: Dec;
  /** Taux saisi, en fraction (0,05 pour 5 %). */
  rate: Dec;
  rateType: RateType;
  /** Durée en années. */
  years: Dec;
  /** Commission prélevée sur les rewards, fraction dans [0, 1[. */
  commission: Dec;
  /** Frais fixe par compound, en jetons. */
  compoundFee: Dec;
  /** Frais fixes d'entrée et de sortie, en jetons. */
  entryFee: Dec;
  exitFee: Dec;
}

export type Status =
  /** Le compound fait croître le capital. */
  | 'ok'
  /** Capital de départ sous le point mort : chaque compound coûte plus qu'il ne rapporte. */
  | 'deficit'
  /** Durée d'une période au plus : aucun compound n'a lieu. */
  | 'no-period'
  /** Le capital tombe à zéro ou en dessous avant la fin : les frais ont tout mangé. */
  | 'depleted';

export interface Outcome {
  /** Compounds par an ; 0 pour « sans compound ». */
  perYear: number;
  /** Nombre de compounds effectués sur la durée. */
  compounds: number;
  /** Solde final, tous frais déduits (sortie comprise). */
  finalBalance: Dec;
  /** Gain net : solde final − montant staké. */
  netGain: Dec;
  /** Rewards bruts, avant commission. */
  grossRewards: Dec;
  /** Commission prélevée sur les rewards. */
  commissionPaid: Dec;
  /** Frais fixes payés : entrée, sortie et compounds. */
  fixedFees: Dec;
  /** Taux annuel réellement obtenu, tous frais compris (D-006) ; null si le solde final est nul ou négatif. */
  effectiveApy: Dec | null;
  status: Status;
}

// ---------- Taux et durée ----------

/** APR équivalent à un APY, convention d'une capitalisation quotidienne (D-002). */
export function aprFromApy(apy: Dec): Dec {
  if (apy.lte(-1)) throw new RangeError(`APY invalide : ${apy.toString()}`);
  return apy.plus(1).pow(new D(1).div(DAYS_PER_YEAR)).minus(1).times(DAYS_PER_YEAR);
}

/** APY d'un APR capitalisé `perYear` fois par an. */
export function apyFromApr(apr: Dec, perYear = DAYS_PER_YEAR): Dec {
  return apr.div(perYear).plus(1).pow(perYear).minus(1);
}

/** APR nominal brut du scénario. Jamais APY ÷ k (D-002). */
export function nominalApr(input: Pick<StakingInput, 'rate' | 'rateType'>): Dec {
  return input.rateType === 'APY' ? aprFromApy(input.rate) : input.rate;
}

/** Durée saisie convertie en années : jour = 1/365, mois = 1/12 (D-003). */
export function toYears(value: Dec, unit: DurationUnit): Dec {
  if (unit === 'days') return value.div(DAYS_PER_YEAR);
  if (unit === 'months') return value.div(12);
  return value;
}

// ---------- Validation ----------

function validate(input: StakingInput): void {
  const { amount, rate, years, commission, compoundFee, entryFee, exitFee } = input;
  if (!amount.gt(0)) throw new RangeError('Le montant staké doit être positif.');
  if (!rate.gt(0)) throw new RangeError('Le taux doit être positif.');
  if (!years.gt(0) || years.gt(MAX_YEARS)) throw new RangeError(`La durée doit être comprise entre 0 et ${MAX_YEARS} ans.`);
  if (commission.isNeg() || commission.gte(1)) throw new RangeError('La commission doit être comprise entre 0 et 100 %.');
  for (const fee of [compoundFee, entryFee, exitFee]) if (fee.isNeg()) throw new RangeError('Les frais ne peuvent pas être négatifs.');
  if (entryFee.gte(amount)) throw new RangeError("Les frais d'entrée dépassent le montant staké.");
}

function checkPerYear(perYear: number): void {
  if (!Number.isInteger(perYear) || perYear < 1 || perYear > DAYS_PER_YEAR) throw new RangeError(`Fréquence invalide : ${perYear} compounds par an.`);
}

/** Reward net d'une période par jeton staké : APR × (1 − c) ÷ k. */
function periodRate(input: StakingInput, perYear: number): Dec {
  return nominalApr(input).times(new D(1).minus(input.commission)).div(perYear);
}

function finish(input: StakingInput, perYear: number, compounds: number, finalBalance: Dec, netRewards: Dec, status: Status): Outcome {
  const keep = new D(1).minus(input.commission);
  const grossRewards = netRewards.div(keep);
  const fixedFees = input.entryFee.plus(input.exitFee).plus(input.compoundFee.times(compounds));
  const netGain = finalBalance.minus(input.amount);
  const effectiveApy = finalBalance.gt(0) ? finalBalance.div(input.amount).pow(new D(1).div(input.years)).minus(1) : null;
  return { perYear, compounds, finalBalance, netGain, grossRewards, commissionPaid: grossRewards.minus(netRewards), fixedFees, effectiveApy, status };
}

// ---------- Sans compound ----------

/** Rewards accumulés sans réinvestissement, réclamés à la sortie (SPEC § 3). */
export function simpleOutcome(input: StakingInput): Outcome {
  validate(input);
  const start = input.amount.minus(input.entryFee);
  const rewards = start.times(nominalApr(input)).times(new D(1).minus(input.commission)).times(input.years);
  const finalBalance = start.plus(rewards).minus(input.exitFee);
  return finish(input, 0, 0, finalBalance, rewards, finalBalance.gt(0) ? 'ok' : 'depleted');
}

// ---------- Avec compound ----------

/**
 * Nombre de compounds sur la durée, et temps restant après le dernier, en années.
 * Un compound a lieu à la fin de chaque période complète, sauf si elle s'achève
 * pile à la fin de la durée : on réclame alors les rewards et on retire, ce que
 * couvrent les frais de sortie (D-003). Le temps restant est donc dans ]0, 1/k].
 */
function periods(input: StakingInput, perYear: number): { m: number; rest: Dec } {
  const total = input.years.times(perYear);
  let m = total.floor();
  if (m.eq(total) && m.gt(0)) m = m.minus(1);
  return { m: m.toNumber(), rest: total.minus(m).div(perYear) };
}

/**
 * Point mort du compound à `perYear` compounds par an : g ÷ q. Au-dessus, un
 * compound rapporte plus qu'il ne coûte et le capital croît ; en dessous, il
 * décroît à chaque compound (D-004). Null si aucun frais par compound.
 */
export function breakEvenCapital(input: StakingInput, perYear: number): Dec | null {
  checkPerYear(perYear);
  if (input.compoundFee.isZero()) return null;
  return input.compoundFee.div(periodRate(input, perYear));
}

/**
 * Compound par la forme fermée (D-004) : M_{i+1} = M_i(1 + q) − g donne
 * M_n = (M₀ − g/q)(1 + q)^n + g/q. Une puissance, quelle que soit la durée.
 */
export function compoundOutcome(input: StakingInput, perYear: number): Outcome {
  validate(input);
  checkPerYear(perYear);
  const q = periodRate(input, perYear);
  const g = input.compoundFee;
  const start = input.amount.minus(input.entryFee);
  const { m, rest } = periods(input, perYear);
  const fixed = g.div(q);
  const capital = m === 0 ? start : start.minus(fixed).times(q.plus(1).pow(m)).plus(fixed);
  // Dernier segment : rewards au prorata du temps restant, réclamés à la sortie.
  const lastRewards = capital.gt(0) ? capital.times(q).times(perYear).times(rest) : new D(0);
  const finalBalance = capital.plus(lastRewards).minus(input.exitFee);
  // Rewards nets : tout ce que le capital a gagné, frais de compound remis.
  const netRewards = capital.minus(start).plus(g.times(m)).plus(lastRewards);
  const status: Status = m === 0 ? 'no-period' : !capital.gt(0) || !finalBalance.gt(0) ? 'depleted' : start.lt(fixed) ? 'deficit' : 'ok';
  return finish(input, perYear, m, finalBalance, netRewards, status);
}

/** Une ligne de l'échéancier (D-008). */
export interface ScheduleRow {
  /** Numéro de période, à partir de 1 ; la dernière ligne peut être une fraction sans compound. */
  period: number;
  /** Fin de la période, en jours depuis le début. */
  day: Dec;
  /** Capital en début de période. */
  capital: Dec;
  /** Reward net de la période. */
  reward: Dec;
  /** Frais payés en fin de période (compound, ou sortie sur la dernière ligne). */
  fee: Dec;
  /** Solde en fin de période. */
  balance: Dec;
}

/**
 * Simulation pas à pas, pour l'échéancier et le graphique. Elle s'arrête si le
 * capital tombe à zéro. Son solde final est celui de `compoundOutcome` (testé).
 */
export function compoundSchedule(input: StakingInput, perYear: number): ScheduleRow[] {
  validate(input);
  checkPerYear(perYear);
  const q = periodRate(input, perYear);
  const apr = q.times(perYear);
  const { m, rest } = periods(input, perYear);
  const periodDays = new D(DAYS_PER_YEAR).div(perYear);
  const rows: ScheduleRow[] = [];
  let capital = input.amount.minus(input.entryFee);
  for (let i = 1; i <= m; i++) {
    const reward = capital.times(q);
    const balance = capital.plus(reward).minus(input.compoundFee);
    rows.push({ period: i, day: periodDays.times(i), capital, reward, fee: input.compoundFee, balance });
    capital = balance;
    if (!capital.gt(0)) return rows;
  }
  const reward = capital.times(apr).times(rest);
  rows.push({ period: m + 1, day: input.years.times(DAYS_PER_YEAR), capital, reward, fee: input.exitFee, balance: capital.plus(reward).minus(input.exitFee) });
  return rows;
}

// ---------- Fréquence optimale et comparaison ----------

/** Solde final pour chaque fréquence de 1 à 365 compounds par an (forme fermée, D-004). */
export function frequencyCurve(input: StakingInput): Outcome[] {
  const out: Outcome[] = [];
  for (let k = 1; k <= DAYS_PER_YEAR; k++) out.push(compoundOutcome(input, k));
  return out;
}

/**
 * Meilleure fréquence de 1 à 365 compounds par an (D-004) ; à solde égal, la
 * moins fréquente. Ne dit pas si compounder vaut mieux que ne rien faire :
 * c'est le rôle de `compare`.
 */
export function optimalOutcome(input: StakingInput, curve: Outcome[] = frequencyCurve(input)): Outcome {
  let best = curve[0];
  for (const o of curve) if (o.finalBalance.gt(best.finalBalance)) best = o;
  return best;
}

export interface Comparison {
  simple: Outcome;
  chosen: Outcome;
  optimal: Outcome;
  /** Meilleur choix : ne pas compounder, la fréquence choisie, ou la fréquence optimale. */
  best: 'simple' | 'chosen' | 'optimal';
  /** Solde final pour 1 à 365 compounds par an. */
  curve: Outcome[];
}

/** Les trois colonnes de l'écran (SPEC § 4). `perYear` = 0 : l'utilisateur ne compounde pas. */
export function compare(input: StakingInput, perYear: number): Comparison {
  const simple = simpleOutcome(input);
  const curve = frequencyCurve(input);
  const optimal = optimalOutcome(input, curve);
  const chosen = perYear === 0 ? simple : curve[perYear - 1] ?? compoundOutcome(input, perYear);
  const top = D.max(simple.finalBalance, chosen.finalBalance, optimal.finalBalance);
  // À égalité, la solution la plus simple l'emporte : ne rien faire, puis le choix de l'utilisateur.
  const best = simple.finalBalance.eq(top) ? 'simple' : chosen.finalBalance.eq(top) ? 'chosen' : 'optimal';
  return { simple, chosen, optimal, best, curve };
}

// ---------- Séries pour le graphique ----------

export interface Point {
  /** Jours depuis le début. */
  day: Dec;
  /** Solde : capital et rewards accumulés ; frais de sortie déduits au dernier point. */
  balance: Dec;
}

/** Garde au plus `max` points, le premier et le dernier compris. */
function thin(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Solde dans le temps sans compound : droite, frais de sortie au dernier point. */
export function simpleSeries(input: StakingInput, max = 120): Point[] {
  validate(input);
  const start = input.amount.minus(input.entryFee);
  const rewards = start.times(nominalApr(input)).times(new D(1).minus(input.commission)).times(input.years);
  const days = input.years.times(DAYS_PER_YEAR);
  const pts: Point[] = [];
  for (let i = 0; i < max; i++) {
    const share = new D(i).div(max - 1);
    const day = days.times(share);
    const balance = start.plus(rewards.times(share));
    pts.push({ day, balance: i === max - 1 ? balance.minus(input.exitFee) : balance });
  }
  return pts;
}

/** Solde dans le temps avec compound : après chaque compound, puis à la sortie. */
export function compoundSeries(input: StakingInput, perYear: number, max = 120): Point[] {
  const start = input.amount.minus(input.entryFee);
  const pts: Point[] = [{ day: new D(0), balance: start }];
  for (const r of compoundSchedule(input, perYear)) pts.push({ day: r.day, balance: r.balance });
  return thin(pts, max);
}
