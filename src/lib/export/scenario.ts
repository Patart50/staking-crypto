/**
 * Export d'un scénario (D-008) : CSV de la comparaison et de l'échéancier, texte
 * copiable, lien de partage. Format CSV du programme (dca D-015) : « ; »,
 * virgule décimale, BOM, sans séparateur de milliers.
 */
import { D, type Dec } from 'commun-crypto/money';
import { rateText, SYMBOL } from 'commun-crypto/currency';
import { defaultForm, frequencyText, sanitize, type Form, type Result } from '../core/form';
import { compoundSchedule, type Outcome } from '../core/staking';

const BOM = '﻿';
const n = (d: Dec, places: number) => d.toDecimalPlaces(places, D.ROUND_HALF_UP).toFixed().replace('.', ',');
const tokens = (d: Dec) => n(d, 8);
const money = (d: Dec) => d.toFixed(2, D.ROUND_HALF_UP).replace('.', ',');
const percent = (d: Dec) => n(d.times(100), 4);

function cell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function rows(lines: string[][]): string {
  return BOM + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n';
}

const UNIT_LABEL = { days: 'jours', months: 'mois', years: 'ans' } as const;

function parameters(r: Result): string[][] {
  const v = r.values;
  const c = SYMBOL[v.currency];
  const out: string[][] = [['Paramètre', 'Valeur']];
  out.push(['Devise', v.currency === 'USD' ? 'Dollar, USDC ($)' : 'Euro (€)']);
  if (v.fx) out.push(['Taux EUR/USDC ($ pour 1 €)', n(v.fx, 6)]);
  out.push(['Jeton', v.asset || 'jeton']);
  if (v.price) out.push([`Cours (${c})`, n(v.price, 8)]);
  out.push(['Montant staké (jetons)', tokens(v.input.amount)]);
  if (v.amountMoney) out.push([`Montant staké (${c})`, money(v.amountMoney)]);
  out.push([`Taux ${v.rateType} (%)`, percent(v.input.rate)]);
  if (v.rateType === 'APY') out.push(['APR équivalent (%)', percent(r.apr)]);
  out.push(['Durée', `${n(v.duration.value, 4)} ${UNIT_LABEL[v.duration.unit]}`], ['Commission (%)', percent(v.input.commission)]);
  out.push(['Fréquence choisie', frequencyText(v.perYear)]);
  out.push([`Frais par compound (${c})`, money(v.fees.compound)], [`Frais d'entrée (${c})`, money(v.fees.entry)], [`Frais de sortie (${c})`, money(v.fees.exit)]);
  return out;
}

/** CSV de la comparaison : paramètres, puis une colonne par stratégie. */
export function comparisonCsv(r: Result): string {
  const { simple, chosen, optimal } = r.comparison;
  const v = r.values;
  const c = SYMBOL[v.currency];
  const cols: [string, Outcome][] = [['Sans compound', simple]];
  if (v.perYear) cols.push([`Fréquence choisie (${frequencyText(v.perYear)})`, chosen]);
  cols.push([`Meilleure fréquence (${frequencyText(optimal.perYear)})`, optimal]);
  const out: string[][] = [['staking-crypto', 'Comparaison sans et avec compound'], [], ...parameters(r), [], ['Résultat', ...cols.map((x) => x[0])]];
  const line = (label: string, f: (o: Outcome) => string) => out.push([label, ...cols.map(([, o]) => f(o))]);
  line('Compounds par an', (o) => String(o.perYear));
  line('Compounds effectués', (o) => String(o.compounds));
  line('Solde final (jetons)', (o) => tokens(o.finalBalance));
  line('Gain net (jetons)', (o) => tokens(o.netGain));
  line('Rewards bruts (jetons)', (o) => tokens(o.grossRewards));
  line('Commission (jetons)', (o) => tokens(o.commissionPaid));
  line('Frais fixes (jetons)', (o) => tokens(o.fixedFees));
  line('APY effectif (%)', (o) => (o.effectiveApy ? percent(o.effectiveApy) : ''));
  if (v.price) {
    const p = v.price;
    line(`Solde final au cours constant (${c})`, (o) => money(o.finalBalance.times(p)));
    line(`Gain net au cours constant (${c})`, (o) => money(o.netGain.times(p)));
  }
  return rows(out);
}

/** CSV de l'échéancier période par période, à la fréquence choisie (ou la meilleure si l'utilisateur ne compounde pas). */
export function scheduleCsv(r: Result): string {
  const k = r.values.perYear || r.comparison.optimal.perYear;
  const c = SYMBOL[r.values.currency];
  const p = r.values.price;
  const head = ['Période', 'Jour', 'Capital (jetons)', 'Reward net (jetons)', 'Frais (jetons)', 'Solde (jetons)', ...(p ? [`Solde au cours constant (${c})`] : [])];
  const out: string[][] = [['staking-crypto', `Échéancier, ${frequencyText(k)}`], [], head];
  for (const row of compoundSchedule(r.values.input, k))
    out.push([String(row.period), n(row.day, 2), tokens(row.capital), tokens(row.reward), tokens(row.fee), tokens(row.balance), ...(p ? [money(row.balance.times(p))] : [])]);
  return rows(out);
}

/** Résumé copiable. `amount` formate une quantité de jetons. */
export function summaryText(r: Result, amount: (d: Dec) => string, sentence: string): string {
  const { simple, chosen, optimal } = r.comparison;
  const v = r.values;
  const lines = [
    `Staking de ${amount(v.input.amount)} à ${percent(v.input.rate)} % (${v.rateType}), commission ${percent(v.input.commission)} %, ${n(v.duration.value, 4)} ${UNIT_LABEL[v.duration.unit]}.`,
    `Sans compound : ${amount(simple.finalBalance)}.`,
  ];
  if (v.perYear) lines.push(`Compound ${frequencyText(v.perYear)} : ${amount(chosen.finalBalance)}.`);
  lines.push(`Meilleure fréquence (${frequencyText(optimal.perYear)}) : ${amount(optimal.finalBalance)}.`, sentence);
  if (v.price) lines.push(`Cours supposé constant : ${n(v.price, 8)} ${SYMBOL[v.currency]}${v.fx ? `, taux ${rateText(v.fx)}` : ''}.`);
  lines.push('Calculé avec staking-crypto : https://patart50.github.io/staking-crypto/');
  return lines.join('\n');
}

// ---------- Lien de partage (renfort D-014) ----------

const KEYS: Record<string, keyof Form> = {
  d: 'currency',
  fx: 'fx',
  a: 'asset',
  p: 'price',
  u: 'amountUnit',
  m: 'amount',
  r: 'rate',
  rt: 'rateType',
  t: 'duration',
  tu: 'durationUnit',
  c: 'commission',
  f: 'frequency',
  k: 'perYear',
  g: 'compoundFee',
  e: 'entryFee',
  s: 'exitFee',
};

/** Fragment `#partage?…` : seuls les champs différents du formulaire par défaut. */
export function shareFragment(form: Form): string {
  const base = defaultForm();
  const params = new URLSearchParams();
  for (const [key, field] of Object.entries(KEYS)) if (form[field] !== base[field]) params.set(key, String(form[field]));
  return `#partage?${params.toString()}`;
}

/** Lecture d'un fragment de partage ; null si ce n'en est pas un. Valeurs contrôlées par `sanitize`. */
export function readShareFragment(hash: string): Form | null {
  if (!hash.startsWith('#partage?')) return null;
  const params = new URLSearchParams(hash.slice('#partage?'.length));
  const raw: Record<string, string> = { ...defaultForm() } as unknown as Record<string, string>;
  for (const [key, field] of Object.entries(KEYS)) {
    const v = params.get(key);
    if (v !== null) raw[field] = v.slice(0, 40);
  }
  return sanitize(raw);
}
