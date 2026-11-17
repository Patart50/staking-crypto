import { describe, expect, it } from 'vitest';
import { dec, type Dec } from 'commun-crypto/money';
import { priceAt } from './at';

const closeFrom = (table: Record<string, string>) => async (symbol: string): Promise<Dec | null> => (table[symbol] ? dec(table[symbol]) : null);

describe('cours à une date (D-023)', () => {
  it('dollars : XUSDC, sinon XUSDT ÷ USDCUSDT, sinon XUSDT', async () => {
    expect((await priceAt(closeFrom({ ETHUSDC: '2500', ETHUSDT: '9' }), 'eth', 'USD', 0))?.route).toBe('ETHUSDC');
    const viaUsdt = await priceAt(closeFrom({ ETHUSDT: '2502', USDCUSDT: '1.0008' }), 'ETH', 'USD', 0);
    expect(viaUsdt?.price.toDecimalPlaces(4).toString()).toBe('2500');
    expect((await priceAt(closeFrom({ ETHUSDT: '2502' }), 'ETH', 'USD', 0))?.route).toBe('ETHUSDT');
    expect(await priceAt(closeFrom({}), 'ETH', 'USD', 0)).toBeNull();
  });

  it('euros : XEUR, sinon XUSDT ÷ EURUSDT', async () => {
    expect((await priceAt(closeFrom({ ETHEUR: '2300' }), 'ETH', 'EUR', 0))?.price.toString()).toBe('2300');
    expect((await priceAt(closeFrom({ ETHUSDT: '2160', EURUSDT: '1.08' }), 'ETH', 'EUR', 0))?.price.toString()).toBe('2000');
  });

  it('USDC en dollars : 1, sans appel', async () => {
    const r = await priceAt(async () => {
      throw new Error('aucun appel attendu');
    }, 'USDC', 'USD', 0);
    expect(r?.price.toString()).toBe('1');
  });
});
