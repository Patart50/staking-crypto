import { describe, expect, it } from 'vitest';
import { dec } from 'commun-crypto/money';
import { compute, defaultForm, fixedPrice, frequencyText, moneyFields, parseForm, sanitize, summary, type Form } from './form';
import { comparisonCsv, readShareFragment, scheduleCsv, shareFragment, summaryText } from '../export/scenario';

const form = (over: Partial<Form> = {}): Form => ({ ...defaultForm(), amount: '1', rate: '4', commission: '10', ...over });
const ok = (f: Form) => {
  const r = parseForm(f);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.values;
};
const eth = (d: ReturnType<typeof dec>) => `${d.toDecimalPlaces(8).toFixed()} ETH`;

describe('parseForm', () => {
  it('dollar par défaut, fréquence hebdomadaire', () => {
    const f = defaultForm();
    expect(f.currency).toBe('USD');
    expect(f.frequency).toBe('weekly');
  });

  it('champs vides : rien en erreur, la liste de ce qui manque', () => {
    const r = parseForm(defaultForm());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual({});
      expect(r.missing).toEqual(['Quantité stakée', 'Taux']);
    }
  });

  it('nombres illisibles, négatifs, commission ≥ 100 %', () => {
    const r = parseForm(form({ rate: 'abc', compoundFee: '-1', commission: '100' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['commission', 'compoundFee', 'rate']);
  });

  it('en jetons, sans frais : le cours est facultatif', () => {
    const v = ok(form());
    expect(v.price).toBeNull();
    expect(v.input.rate.toString()).toBe('0.04');
    expect(v.input.commission.toString()).toBe('0.1');
  });

  it('un frais fixe exige le cours, puis il est converti en jetons', () => {
    const r = parseForm(form({ compoundFee: '0,50' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['Cours de ETH']);
    const v = ok(form({ compoundFee: '0,50', price: '2 500' }));
    expect(v.input.compoundFee.toString()).toBe('0.0002');
  });

  it('montant saisi en devise, converti au cours', () => {
    const v = ok(form({ amountUnit: 'money', amount: '5 000 $', price: '2500' }));
    expect(v.input.amount.toString()).toBe('2');
    expect(v.amountMoney?.toString()).toBe('5000');
  });

  it('USDC en dollars : cours fixé à 1', () => {
    expect(fixedPrice({ asset: 'usdc', currency: 'USD' })).toBe(true);
    expect(fixedPrice({ asset: 'USDC', currency: 'EUR' })).toBe(false);
    const v = ok(form({ asset: 'USDC', amountUnit: 'money', amount: '1000', compoundFee: '1' }));
    expect(v.price?.toString()).toBe('1');
    expect(v.input.compoundFee.toString()).toBe('1');
  });

  it('fréquences', () => {
    expect(ok(form({ frequency: 'none' })).perYear).toBe(0);
    expect(ok(form({ frequency: 'daily' })).perYear).toBe(365);
    expect(ok(form({ frequency: 'monthly' })).perYear).toBe(12);
    expect(ok(form({ frequency: 'custom', perYear: '24' })).perYear).toBe(24);
    for (const k of ['0', '366', '2,5']) expect(parseForm(form({ frequency: 'custom', perYear: k })).ok).toBe(false);
  });

  it('durée : unité et plafond de 50 ans', () => {
    expect(ok(form({ duration: '18', durationUnit: 'months' })).input.years.toString()).toBe('1.5');
    const r = parseForm(form({ duration: '51' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.duration).toMatch(/50 ans/);
  });

  it("frais d'entrée supérieurs au montant", () => {
    const r = parseForm(form({ entryFee: '3000', price: '2500' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.entryFee).toBeTruthy();
  });

  it('champs à convertir lors d’un changement de devise', () => {
    expect(moneyFields(form())).toEqual({ prices: ['price', 'startPrice'], amounts: ['compoundFee', 'entryFee', 'exitFee'] });
    expect(moneyFields(form({ amountUnit: 'money' })).amounts).toContain('amount');
  });
});

describe('compute et synthèse', () => {
  // Exemple de référence : 1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound (0,50 $ à 2 500 $), 1 an.
  const ref = (over: Partial<Form> = {}) => compute(ok(form({ compoundFee: '0,50', price: '2500', ...over })));

  it('trois colonnes, meilleure fréquence et point mort', () => {
    const r = ref({ frequency: 'daily' });
    expect(r.comparison.simple.finalBalance.toString()).toBe('1.036');
    expect(r.comparison.optimal.perYear).toBe(2);
    expect(r.breakEven!.toDecimalPlaces(2).toString()).toBe('2.03');
    expect(r.series.chosen!.at(-1)!.balance.minus(r.comparison.chosen.finalBalance).abs().lt('1e-30')).toBe(true);
    expect(r.series.simple.at(-1)?.balance.eq(r.comparison.simple.finalBalance)).toBe(true);
  });

  it('synthèse : le choix fait perdre, la meilleure fréquence est marginale', () => {
    const s = summary(ref({ frequency: 'daily' }), eth);
    expect(s).toMatch(/^La meilleure fréquence est 2 fois par an/);
    expect(s).toMatch(/un gain marginal/);
    expect(s).toMatch(/Votre choix \(chaque jour\) fait perdre 0\.07347217 ETH/);
  });

  it('synthèse : ne pas compounder', () => {
    const r = ref({ compoundFee: '50', frequency: 'weekly' });
    expect(r.comparison.best).toBe('simple');
    expect(summary(r, eth)).toMatch(/^Ne compoundez pas/);
    expect(summary(ref({ compoundFee: '50', frequency: 'none' }), eth)).toMatch(/^Ne rien faire est le meilleur choix/);
  });

  it('synthèse : sans frais, compounder chaque jour est le meilleur choix', () => {
    const r = compute(ok(form({ frequency: 'daily', amount: '100', rate: '10' })));
    expect(r.comparison.best).toBe('chosen');
    expect(summary(r, eth)).toMatch(/^Compounder chaque jour est le meilleur choix/);
  });

  it('textes de fréquence', () => {
    expect(frequencyText(0)).toBe('sans compound');
    expect(frequencyText(52)).toBe('chaque semaine');
    expect(frequencyText(24)).toBe('24 fois par an (tous les 15,2 jours)');
  });
});

describe('export et partage (D-008)', () => {
  const r = compute(ok(form({ compoundFee: '0,50', price: '2500', frequency: 'monthly' })));

  it('CSV de comparaison : BOM, « ; », virgule décimale, une colonne par stratégie', () => {
    const csv = comparisonCsv(r);
    expect(csv.startsWith('﻿staking-crypto;')).toBe(true);
    expect(csv).toContain('Solde final (jetons);1,036;1,03435998;1,0361204');
    expect(csv).toContain('Cours ($);2500');
    expect(csv).toContain('Solde final au cours constant ($);2590,00;');
  });

  it('CSV de l’échéancier : une ligne par compound, plus la sortie', () => {
    const lines = scheduleCsv(r).trim().split('\r\n');
    expect(lines).toHaveLength(3 + 12);
    expect(lines.at(-1)).toMatch(/^12;\d{4}-\d{2}-\d{2};365;/);
  });

  it('résumé copiable', () => {
    expect(summaryText(r, eth, 'Phrase.')).toContain('Meilleure fréquence (2 fois par an (tous les 182,5 jours)) : 1.0361204 ETH.');
  });

  it('lien de partage : aller-retour, champs par défaut omis', () => {
    const f = form({ compoundFee: '0,50', price: '2500', currency: 'EUR', frequency: 'custom', perYear: '6' });
    const frag = shareFragment(f);
    expect(frag).not.toContain('a=ETH');
    expect(readShareFragment(frag)).toEqual(f);
  });

  it('lien de partage : valeurs contrôlées', () => {
    const f = readShareFragment('#partage?d=XXX&f=hourly&m=' + '9'.repeat(80) + '&zz=1')!;
    expect(f.currency).toBe('USD');
    expect(f.frequency).toBe('weekly');
    expect(f.amount).toHaveLength(40);
    expect(readShareFragment('#a-propos')).toBeNull();
    expect(sanitize('x')).toBeNull();
  });
});
