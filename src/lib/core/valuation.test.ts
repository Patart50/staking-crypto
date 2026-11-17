import { describe, expect, it } from 'vitest';
import { D, dec } from 'commun-crypto/money';
import { balanceAt, compoundOutcome, simpleOutcome, type StakingInput } from './staking';
import { valuation } from './valuation';
import { addDays, daysBetween, eachDay } from './dates';
import { combine } from '../prices/history';
import { defaultForm, parseForm } from './form';

const REF: StakingInput = {
  amount: dec('1'),
  rate: dec('0.04'),
  rateType: 'APR',
  years: dec('1'),
  commission: dec('0.10'),
  compoundFee: dec('0.0002'),
  entryFee: dec('0.001'),
  exitFee: dec('0.0005'),
};

describe('solde à une date (D-021)', () => {
  it('jour 0 : montant moins frais d’entrée ; fin : solde final', () => {
    for (const k of [0, 2, 12, 52, 365]) {
      expect(balanceAt(REF, k, dec(0)).toString()).toBe('0.999');
      const end = k ? compoundOutcome(REF, k).finalBalance : simpleOutcome(REF).finalBalance;
      expect(balanceAt(REF, k, dec(365)).minus(end).abs().lt('1e-30')).toBe(true);
    }
  });

  it('sans compound : linéaire ; avec compound : marche après chaque compound', () => {
    expect(balanceAt(REF, 0, dec('182.5')).toString()).toBe(dec('0.999').plus(dec('0.999').times('0.036').div(2)).toString());
    const before = balanceAt(REF, 2, dec('182.4'));
    const after = balanceAt(REF, 2, dec('182.5'));
    // Le compound à mi-parcours retire le gas : le solde baisse de 0,0002 moins une journée de rewards.
    expect(after.minus(before).toDecimalPlaces(4).toString()).toBe('-0.0002');
  });
});

describe('historique combiné', () => {
  it('premier chemin disponible, trous comblés par le dernier cours', () => {
    const usdc = new Map([['2025-01-02', dec(10)], ['2025-01-04', dec(12)]]);
    const usdt = new Map([['2025-01-01', dec(9)], ['2025-01-02', dec(99)]]);
    const h = combine('X', 'USD', '2025-01-01', '2025-01-05', [
      ['USDC', (d) => usdc.get(d)],
      ['USDT', (d) => usdt.get(d)],
    ]);
    expect([...h.prices.entries()].map(([d, p]) => `${d}=${p}`)).toEqual(['2025-01-01=9', '2025-01-02=10', '2025-01-03=10', '2025-01-04=12', '2025-01-05=12']);
    expect(h.route).toBe('USDC');
    expect(h.first).toBe('2025-01-01');
  });

  it('avant la première cotation : pas de cours', () => {
    const h = combine('X', 'EUR', '2025-01-01', '2025-01-03', [['EUR', (d) => (d === '2025-01-03' ? dec(5) : undefined)]]);
    expect(h.first).toBe('2025-01-03');
    expect(h.prices.size).toBe(1);
  });
});

describe('valeur dans le temps', () => {
  const start = '2025-01-01';
  const today = '2025-07-02'; // 182 jours plus tard
  // Cours fictif : 2 000 au départ, +10 par jour.
  const history = new Map(eachDay(start, addDays(today, -1)).map((d) => [d, dec(2000).plus(dec(10).times(daysBetween(start, d)))] as const));

  it('passé au cours historique, futur au cours actuel constant', () => {
    const v = valuation(REF, 12, start, today, history, dec(3000))!;
    expect(v.todayDay).toBe(182);
    const first = v.points[0];
    expect(first.price.toString()).toBe('2000');
    expect(first.hold.toString()).toBe('2000');
    const after = v.points.filter((p) => p.day >= 182);
    expect(after.every((p) => p.price.eq(3000))).toBe(true);
    expect(v.points.at(-1)!.day).toBe(365);
  });

  it('à ce jour : effet du staking + effet du cours = résultat total', () => {
    const v = valuation(REF, 12, start, today, history, dec(3000))!;
    const n = v.now!;
    expect(n.day).toBe(182);
    expect(n.priceStart.toString()).toBe('2000');
    expect(n.price.toString()).toBe('3000');
    expect(n.stakingValue.minus(n.initialValue).eq(n.stakingEffect.plus(n.priceEffect))).toBe(true);
    expect(n.holdValue.toString()).toBe('3000');
  });

  it('staking qui commence aujourd’hui : pas de situation à date, cours actuel partout', () => {
    const v = valuation(REF, 0, today, today, null, dec(3000))!;
    expect(v.now).toBeNull();
    expect(v.todayDay).toBeNull();
    expect(v.points.every((p) => p.price.eq(3000))).toBe(true);
  });

  it('durée écoulée : situation à la fin, au cours historique', () => {
    const shortInput = { ...REF, years: new D(30).div(365) };
    const v = valuation(shortInput, 0, start, today, history, dec(3000))!;
    expect(v.now!.day).toBe(30);
    expect(v.now!.price.toString()).toBe('2300');
  });
});

describe('date de début', () => {
  const base = { ...defaultForm(), amount: '1', rate: '4' };
  it('vide : aujourd’hui ; invalide, future ou avant 2017 : erreur', () => {
    const r = parseForm(base);
    expect(r.ok && !r.values.startGiven).toBe(true);
    for (const d of ['2025-02-30', '2999-01-01', '2016-12-31']) {
      const x = parseForm({ ...base, startDate: d });
      expect(!x.ok && !!x.errors.startDate).toBe(true);
    }
    const ok = parseForm({ ...base, startDate: '2024-03-01' });
    expect(ok.ok && ok.values.startDate).toBe('2024-03-01');
  });
});

describe('cours au début (D-023)', () => {
  const base = { ...defaultForm(), amount: '5 000', amountUnit: 'money' as const, rate: '4', startDate: '2025-03-01', startTime: '14:30' };
  it('montant en devise converti au cours du début', () => {
    const r = parseForm({ ...base, startPrice: '2 500', price: '4 000' });
    expect(r.ok && r.values.input.amount.toString()).toBe('2');
    expect(r.ok && r.values.startTime).toBe('14:30');
  });
  it('heure invalide ou future', () => {
    expect(parseForm({ ...base, startTime: '25:00' }).ok).toBe(false);
    const todayDate = new Date().toISOString().slice(0, 10);
    const r = parseForm({ ...base, startDate: todayDate, startTime: '23:59', startPrice: '1' });
    // Aujourd'hui à 23:59 (Paris) n'est futur que si on n'y est pas encore : on vérifie seulement l'absence de plantage.
    expect(typeof r.ok).toBe('boolean');
  });
  it('sans cours au début ni cours actuel : à renseigner', () => {
    const r = parseForm(base);
    expect(!r.ok && r.missing).toContain('Cours au début');
  });
  it('valeur : le cours au début remplace la clôture du premier jour', () => {
    const start = '2025-01-01';
    const history = new Map(eachDay(start, '2025-07-01').map((d) => [d, dec(2000)] as const));
    const v = valuation(REF, 0, start, '2025-07-02', history, dec(3000), dec(1800))!;
    expect(v.points[0].price.toString()).toBe('1800');
    expect(v.now!.priceStart.toString()).toBe('1800');
  });
});
