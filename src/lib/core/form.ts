/**
 * Saisie du formulaire → valeurs validées → résultat complet (SPEC § 2 à 4).
 * Logique pure : l'interface n'appelle que `parseForm` et `compute`.
 *
 * La simulation se fait en jetons (D-014) : montant saisi en devise et frais
 * fixes (toujours en devise) sont convertis au cours, constant sur la durée.
 */
import { D, type Dec } from 'commun-crypto/money';
import { isCurrency, readAmount, type Currency } from 'commun-crypto/currency';
import {
  breakEvenCapital,
  compare,
  compoundSeries,
  DAYS_PER_YEAR,
  FREQUENCIES,
  MAX_YEARS,
  nominalApr,
  simpleSeries,
  toYears,
  type Comparison,
  type DurationUnit,
  type Point,
  type RateType,
  type StakingInput,
} from './staking';

export type Frequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type AmountUnit = 'token' | 'money';

/** Champs du formulaire, tels que saisis (chaînes). Taux et commission en %. */
export interface Form {
  /** Devise des montants en monnaie : dollar (USDC) par défaut (D-014). */
  currency: Currency;
  /** Taux EUR/USDC : USDC pour 1 €. Facultatif. */
  fx: string;
  asset: string;
  /** Cours d'un jeton dans la devise. */
  price: string;
  amountUnit: AmountUnit;
  amount: string;
  rate: string;
  rateType: RateType;
  duration: string;
  durationUnit: DurationUnit;
  commission: string;
  frequency: Frequency;
  /** Compounds par an, fréquence personnalisée. */
  perYear: string;
  /** Frais fixes, dans la devise. */
  compoundFee: string;
  entryFee: string;
  exitFee: string;
}

export type Field = 'fx' | 'asset' | 'price' | 'amount' | 'rate' | 'duration' | 'commission' | 'perYear' | 'compoundFee' | 'entryFee' | 'exitFee';
export const TEXT_FIELDS: readonly Field[] = ['fx', 'asset', 'price', 'amount', 'rate', 'duration', 'commission', 'perYear', 'compoundFee', 'entryFee', 'exitFee'];
export const FREQUENCY_LIST: readonly Frequency[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];
const RATE_TYPES: readonly RateType[] = ['APR', 'APY'];
const DURATION_UNITS: readonly DurationUnit[] = ['days', 'months', 'years'];
const AMOUNT_UNITS: readonly AmountUnit[] = ['token', 'money'];

export function defaultForm(): Form {
  return {
    currency: 'USD',
    fx: '',
    asset: 'ETH',
    price: '',
    amountUnit: 'token',
    amount: '',
    rate: '',
    rateType: 'APR',
    duration: '1',
    durationUnit: 'years',
    commission: '',
    frequency: 'weekly',
    perYear: '24',
    compoundFee: '',
    entryFee: '',
    exitFee: '',
  };
}

/** Champs de montant à convertir lors d'un changement de devise (commun-crypto/currency). */
export function moneyFields(form: Form): { prices: Field[]; amounts: Field[] } {
  return { prices: ['price'], amounts: [...(form.amountUnit === 'money' ? (['amount'] as Field[]) : []), 'compoundFee', 'entryFee', 'exitFee'] };
}

/** Formulaire relu depuis le stockage ou un lien : champs inconnus ignorés, chaînes de 40 caractères au plus. */
export function sanitize(raw: unknown): Form | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Record<string, unknown>;
  const f = defaultForm();
  if (isCurrency(src.currency)) f.currency = src.currency;
  if (AMOUNT_UNITS.includes(src.amountUnit as AmountUnit)) f.amountUnit = src.amountUnit as AmountUnit;
  if (RATE_TYPES.includes(src.rateType as RateType)) f.rateType = src.rateType as RateType;
  if (DURATION_UNITS.includes(src.durationUnit as DurationUnit)) f.durationUnit = src.durationUnit as DurationUnit;
  if (FREQUENCY_LIST.includes(src.frequency as Frequency)) f.frequency = src.frequency as Frequency;
  for (const k of TEXT_FIELDS) if (typeof src[k] === 'string') f[k] = (src[k] as string).slice(0, 40);
  return f;
}

/** Le cours est fixé à 1 : jeton USDC compté en dollars (D-014). */
export function fixedPrice(form: Pick<Form, 'asset' | 'currency'>): boolean {
  return form.currency === 'USD' && form.asset.trim().toUpperCase() === 'USDC';
}

export interface Values {
  currency: Currency;
  fx: Dec | null;
  asset: string;
  /** Cours dans la devise ; null s'il n'est ni saisi ni nécessaire. */
  price: Dec | null;
  /** Montant saisi en devise (null s'il est saisi en jetons). */
  amountMoney: Dec | null;
  /** Frais fixes saisis, en devise. */
  fees: { compound: Dec; entry: Dec; exit: Dec };
  frequency: Frequency;
  /** Compounds par an ; 0 sans compound. */
  perYear: number;
  rateType: RateType;
  /** Durée telle que saisie, pour l'affichage. */
  duration: { value: Dec; unit: DurationUnit };
  /** Entrée du moteur, en jetons. */
  input: StakingInput;
}

export type ParseResult =
  | { ok: true; values: Values }
  | { ok: false; errors: Partial<Record<Field, string>>; missing: string[] };

interface ReadOptions {
  label: string;
  required?: boolean;
  positive?: boolean;
  percent?: boolean;
}

export function parseForm(form: Form): ParseResult {
  const errors: Partial<Record<Field, string>> = {};
  const missing: string[] = [];
  const read = (field: Field, o: ReadOptions): Dec | null => {
    let v: Dec | null;
    try {
      v = readAmount(form[field]);
    } catch {
      errors[field] = `${o.label} : nombre invalide.`;
      return null;
    }
    if (v === null) {
      if (o.required) missing.push(o.label);
      return null;
    }
    if (v.isNeg()) errors[field] = `${o.label} : ne peut pas être négatif.`;
    else if (o.positive && v.isZero()) errors[field] = `${o.label} : doit être supérieur à zéro.`;
    else if (o.percent && v.gte(100)) errors[field] = `${o.label} : doit être inférieur à 100 %.`;
    return v;
  };

  const asset = form.asset.trim().toUpperCase();
  if (asset && !/^[A-Z0-9]{1,15}$/.test(asset)) errors.asset = 'Jeton : lettres et chiffres seulement (ex. ETH).';

  const fx = read('fx', { label: 'Taux EUR/USDC', positive: true });
  const amount = read('amount', { label: form.amountUnit === 'money' ? 'Montant staké' : 'Quantité stakée', required: true, positive: true });
  const rate = read('rate', { label: 'Taux', required: true, positive: true });
  const duration = read('duration', { label: 'Durée', required: true, positive: true });
  const commission = read('commission', { label: 'Commission', percent: true }) ?? new D(0);
  const fees = {
    compound: read('compoundFee', { label: 'Frais par compound' }) ?? new D(0),
    entry: read('entryFee', { label: "Frais d'entrée" }) ?? new D(0),
    exit: read('exitFee', { label: 'Frais de sortie' }) ?? new D(0),
  };

  const needsPrice = form.amountUnit === 'money' || !fees.compound.isZero() || !fees.entry.isZero() || !fees.exit.isZero();
  let price: Dec | null;
  if (fixedPrice(form)) price = new D(1);
  else price = read('price', { label: `Cours de ${asset || 'du jeton'}`, required: needsPrice, positive: true });

  let perYear = 0;
  if (form.frequency === 'custom') {
    const k = read('perYear', { label: 'Compounds par an', required: true, positive: true });
    if (k && !errors.perYear) {
      if (!k.isInteger() || k.gt(DAYS_PER_YEAR)) errors.perYear = `Compounds par an : nombre entier de 1 à ${DAYS_PER_YEAR}.`;
      else perYear = k.toNumber();
    }
  } else if (form.frequency !== 'none') perYear = FREQUENCIES[form.frequency];

  let years: Dec | null = null;
  if (duration && !errors.duration) {
    years = toYears(duration, form.durationUnit);
    if (years.gt(MAX_YEARS)) errors.duration = `Durée : ${MAX_YEARS} ans au plus.`;
  }

  if (Object.keys(errors).length || missing.length || !amount || !rate || !duration || !years) return { ok: false, errors, missing };

  const toTokens = (v: Dec) => (price ? v.div(price) : v);
  const amountTokens = form.amountUnit === 'money' ? toTokens(amount) : amount;
  const input: StakingInput = {
    amount: amountTokens,
    rate: rate.div(100),
    rateType: form.rateType,
    years,
    commission: commission.div(100),
    compoundFee: toTokens(fees.compound),
    entryFee: toTokens(fees.entry),
    exitFee: toTokens(fees.exit),
  };
  if (input.entryFee.gte(input.amount)) {
    errors.entryFee = "Frais d'entrée : ils dépassent le montant staké.";
    return { ok: false, errors, missing };
  }

  return {
    ok: true,
    values: {
      currency: form.currency,
      fx,
      asset,
      price,
      amountMoney: form.amountUnit === 'money' ? amount : null,
      fees,
      frequency: form.frequency,
      perYear,
      rateType: form.rateType,
      duration: { value: duration, unit: form.durationUnit },
      input,
    },
  };
}

export interface Result {
  values: Values;
  comparison: Comparison;
  /** APR nominal brut utilisé (APY converti, D-002). */
  apr: Dec;
  /** Point mort à la fréquence choisie, en jetons ; null sans compound ou sans frais. */
  breakEven: Dec | null;
  series: { simple: Point[]; chosen: Point[] | null; optimal: Point[] };
}

export function compute(values: Values): Result {
  const { input, perYear } = values;
  const comparison = compare(input, perYear);
  return {
    values,
    comparison,
    apr: nominalApr(input),
    breakEven: perYear ? breakEvenCapital(input, perYear) : null,
    series: {
      simple: simpleSeries(input),
      chosen: perYear ? compoundSeries(input, perYear) : null,
      optimal: compoundSeries(input, comparison.optimal.perYear),
    },
  };
}

// ---------- Textes ----------

/** « chaque semaine », « 24 fois par an (tous les 15,2 jours) ». */
export function frequencyText(perYear: number): string {
  if (perYear === 0) return 'sans compound';
  if (perYear === 365) return 'chaque jour';
  if (perYear === 52) return 'chaque semaine';
  if (perYear === 12) return 'chaque mois';
  if (perYear === 1) return 'une fois par an';
  const days = new D(DAYS_PER_YEAR).div(perYear).toDecimalPlaces(1).toFixed().replace('.', ',');
  return `${perYear} fois par an (tous les ${days} jours)`;
}

/**
 * Phrase de synthèse (SPEC § 4), sans enrobage. `amount` formate une quantité
 * de jetons (avec équivalent en devise si un cours est connu).
 */
export function summary(r: Result, amount: (tokens: Dec) => string): string {
  const { simple, chosen, optimal, best } = r.comparison;
  const staked = r.values.input.amount;
  const vsSimple = (o: typeof simple) => o.finalBalance.minus(simple.finalBalance);
  // Moins de 0,1 % du montant staké sur toute la durée : gain marginal.
  const marginal = (gain: Dec) => gain.lt(staked.times('0.001'));
  const userCompounds = r.values.perYear > 0;

  if (best === 'simple') {
    if (userCompounds && vsSimple(chosen).isNeg())
      return `Ne compoundez pas : compounder ${frequencyText(r.values.perYear)} vous ferait perdre ${amount(vsSimple(chosen).abs())} par rapport à ne rien faire, et aucune autre fréquence ne rapporte plus que ses frais.`;
    return 'Ne rien faire est le meilleur choix : aucune fréquence de compound ne rapporte plus que ses frais.';
  }
  if (best === 'chosen') {
    const g = vsSimple(chosen);
    return `Compounder ${frequencyText(r.values.perYear)} est le meilleur choix : ${amount(g)} de plus que sans compound${marginal(g) ? ', un gain marginal' : ''}.`;
  }
  const g = vsSimple(optimal);
  let s = `La meilleure fréquence est ${frequencyText(optimal.perYear)} : ${amount(g)} de plus que sans compound${marginal(g) ? ', un gain marginal' : ''}.`;
  if (userCompounds) {
    const d = optimal.finalBalance.minus(chosen.finalBalance);
    s += vsSimple(chosen).isNeg()
      ? ` Votre choix (${frequencyText(r.values.perYear)}) fait perdre ${amount(vsSimple(chosen).abs())} par rapport à ne rien faire.`
      : ` C'est ${amount(d)} de plus que votre choix (${frequencyText(r.values.perYear)}).`;
  }
  return s;
}
