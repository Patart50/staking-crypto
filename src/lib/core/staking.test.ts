import { describe, expect, it } from 'vitest';
import { dec, type Dec } from 'commun-crypto/money';
import {
  aprFromApy,
  apyFromApr,
  breakEvenCapital,
  compare,
  compoundOutcome,
  compoundSchedule,
  nominalApr,
  optimalOutcome,
  simpleOutcome,
  toYears,
  type StakingInput,
} from './staking';

const input = (over: Partial<Record<keyof StakingInput, string>> & { rateType?: 'APR' | 'APY' } = {}): StakingInput => {
  const { rateType = 'APR', ...rest } = over;
  const v = { amount: '1000', rate: '0.10', years: '1', commission: '0', compoundFee: '0', entryFee: '0', exitFee: '0', ...rest };
  return {
    amount: dec(v.amount),
    rate: dec(v.rate),
    rateType,
    years: dec(v.years),
    commission: dec(v.commission),
    compoundFee: dec(v.compoundFee),
    entryFee: dec(v.entryFee),
    exitFee: dec(v.exitFee),
  };
};

/** Écart relatif sous 10^-places. */
const close = (a: Dec, b: Dec, places = 30) => expect(a.minus(b).abs().lte(dec(10).pow(-places).times(b.abs().plus(1)))).toBe(true);

// Exemple de référence de la passation : 1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound, 1 an.
const REF = input({ amount: '1', rate: '0.04', commission: '0.10', compoundFee: '0.0002' });

describe('taux et durée (D-002, D-003)', () => {
  it('APY → APR par capitalisation quotidienne, et retour', () => {
    const apr = aprFromApy(dec('0.05'));
    expect(apr.toDecimalPlaces(8).toString()).toBe('0.04879343');
    close(apyFromApr(apr), dec('0.05'));
  });

  it('jamais APY ÷ k : un APY saisi redonne l’APY avec un compound quotidien sans frais', () => {
    const o = compoundOutcome(input({ rate: '0.05', rateType: 'APY' }), 365);
    close(o.finalBalance, dec('1050'));
    close(o.effectiveApy!, dec('0.05'));
  });

  it('un APR saisi est utilisé tel quel', () => {
    expect(nominalApr({ rate: dec('0.07'), rateType: 'APR' }).toString()).toBe('0.07');
  });

  it('durées : jours, mois, années', () => {
    expect(toYears(dec(730), 'days').toString()).toBe('2');
    expect(toYears(dec(18), 'months').toString()).toBe('1.5');
    expect(toYears(dec(3), 'years').toString()).toBe('3');
  });
});

describe('sans compound', () => {
  it('rewards = montant × APR × années, commission sur les rewards', () => {
    expect(simpleOutcome(input()).finalBalance.toString()).toBe('1100');
    const o = simpleOutcome(input({ commission: '0.10', years: '2' }));
    expect(o.finalBalance.toString()).toBe('1180');
    expect(o.grossRewards.toString()).toBe('200');
    expect(o.commissionPaid.toString()).toBe('20');
  });

  it('frais d’entrée sur le capital, frais de sortie à la fin', () => {
    const o = simpleOutcome(input({ entryFee: '10', exitFee: '5' }));
    expect(o.finalBalance.toString()).toBe('1084');
    expect(o.fixedFees.toString()).toBe('15');
    expect(o.netGain.toString()).toBe('84');
  });
});

describe('avec compound (D-003, D-004)', () => {
  it('sans frais, retrouve la formule d’école M(1 + APR/k)^(kT)', () => {
    const o = compoundOutcome(input({ years: '2' }), 12);
    close(o.finalBalance, dec('1000').times(dec('0.10').div(12).plus(1).pow(24)), 40);
    expect(o.compounds).toBe(23);
  });

  it('pas de compound à la toute fin : le dernier claim est couvert par les frais de sortie', () => {
    expect(compoundOutcome(input(), 12).compounds).toBe(11);
    expect(compoundOutcome(input({ years: '1.05' }), 12).compounds).toBe(12);
    // Un compound par an sur un an : rien n'est réinvesti, identique au sans compound.
    expect(compoundOutcome(REF, 1).finalBalance.eq(simpleOutcome(REF).finalBalance)).toBe(true);
  });

  it('forme fermée = simulation pas à pas', () => {
    const cases: [StakingInput, number][] = [
      [REF, 52],
      [input({ years: toYears(dec(400), 'days').toString(), commission: '0.05', compoundFee: '0.3', entryFee: '2', exitFee: '1' }), 52],
      [input({ rate: '0.12', rateType: 'APY', years: '3.3', compoundFee: '0.05' }), 365],
      [input({ years: toYears(dec(10), 'days').toString(), compoundFee: '1' }), 12],
    ];
    for (const [i, k] of cases) {
      const rows = compoundSchedule(i, k);
      const o = compoundOutcome(i, k);
      close(rows.at(-1)!.balance, o.finalBalance);
      expect(rows.length).toBe(o.compounds + 1);
      expect(rows.at(-1)!.day.toString()).toBe(i.years.times(365).toString());
    }
  });

  it('comptes : solde = montant − frais fixes + rewards bruts − commission', () => {
    const i = input({ commission: '0.08', compoundFee: '0.4', entryFee: '3', exitFee: '2', years: '2.5' });
    for (const o of [simpleOutcome(i), compoundOutcome(i, 52)]) {
      close(o.finalBalance, i.amount.minus(o.fixedFees).plus(o.grossRewards).minus(o.commissionPaid));
    }
  });

  it('exemple de référence : quotidien perd, mensuel gagne moins que ne rien faire', () => {
    expect(simpleOutcome(REF).finalBalance.toString()).toBe('1.036');
    const daily = compoundOutcome(REF, 365);
    expect(daily.finalBalance.toDecimalPlaces(8).toString()).toBe('0.96252783');
    expect(daily.status).toBe('deficit');
    expect(compoundOutcome(REF, 12).finalBalance.toDecimalPlaces(8).toString()).toBe('1.03435998');
  });
});

describe('point mort et statuts', () => {
  it('point mort = g × k ÷ (APR × (1 − c))', () => {
    expect(breakEvenCapital(REF, 12)!.toDecimalPlaces(6).toString()).toBe('0.066667');
    expect(breakEvenCapital(REF, 365)!.toDecimalPlaces(6).toString()).toBe('2.027778');
    expect(breakEvenCapital(input(), 12)).toBeNull();
  });

  it('au-dessus du point mort : ok ; en dessous : deficit', () => {
    expect(compoundOutcome(REF, 12).status).toBe('ok');
    expect(compoundOutcome(REF, 365).status).toBe('deficit');
  });

  it('durée d’une période au plus : aucun compound', () => {
    const o = compoundOutcome(input({ years: toYears(dec(5), 'days').toString() }), 52);
    expect(o.status).toBe('no-period');
    expect(o.finalBalance.eq(simpleOutcome(input({ years: toYears(dec(5), 'days').toString() })).finalBalance)).toBe(true);
  });

  it('frais qui mangent tout le capital : depleted, pas d’APY', () => {
    const i = input({ amount: '1', compoundFee: '0.05' });
    const o = compoundOutcome(i, 365);
    expect(o.status).toBe('depleted');
    expect(o.effectiveApy).toBeNull();
    const rows = compoundSchedule(i, 365);
    expect(rows.at(-1)!.balance.gt(0)).toBe(false);
    expect(rows.length).toBeLessThan(365);
  });
});

describe('fréquence optimale et comparaison (D-004)', () => {
  it('exemple de référence : 2 compounds par an, à peine mieux que ne rien faire', () => {
    const best = optimalOutcome(REF);
    expect(best.perYear).toBe(2);
    expect(best.finalBalance.toString()).toBe('1.0361204');
    const c = compare(REF, 365);
    expect(c.best).toBe('optimal');
    expect(c.chosen.finalBalance.lt(c.simple.finalBalance)).toBe(true);
  });

  it('identique à une recherche pas à pas', () => {
    const i = input({ amount: '50', rate: '0.06', commission: '0.05', compoundFee: '0.02', years: '2' });
    let best = { k: 0, balance: dec(0) };
    for (let k = 1; k <= 365; k++) {
      const b = compoundSchedule(i, k).at(-1)!.balance;
      if (b.gt(best.balance)) best = { k, balance: b };
    }
    expect(optimalOutcome(i).perYear).toBe(best.k);
  });

  it('sans frais, le plus fréquent gagne', () => {
    expect(optimalOutcome(input()).perYear).toBe(365);
  });

  it('à égalité, ne rien faire l’emporte', () => {
    const c = compare(input({ years: toYears(dec(1), 'days').toString() }), 365);
    expect(c.best).toBe('simple');
  });

  it('50 ans : 365 fréquences en moins d’une seconde', () => {
    const t = performance.now();
    optimalOutcome(input({ years: '50', compoundFee: '0.1' }));
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('validation', () => {
  it.each([
    ['montant nul', { amount: '0' }],
    ['taux nul', { rate: '0' }],
    ['durée nulle', { years: '0' }],
    ['durée trop longue', { years: '51' }],
    ['commission 100 %', { commission: '1' }],
    ['frais négatif', { compoundFee: '-1' }],
    ["frais d'entrée ≥ montant", { entryFee: '1000' }],
  ])('%s', (_, over) => {
    expect(() => simpleOutcome(input(over))).toThrow(RangeError);
  });

  it('fréquence hors de 1 à 365', () => {
    expect(() => compoundOutcome(input(), 0)).toThrow(RangeError);
    expect(() => compoundOutcome(input(), 366)).toThrow(RangeError);
  });
});
