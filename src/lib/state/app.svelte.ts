/**
 * État de l'application : formulaire (gardé sur l'appareil), scénarios
 * enregistrés (D-007), réglages, cours du jour et taux EUR/USDC via Binance en
 * opt-in (D-015), devise (D-014), messages. Structure reprise de renfort-crypto
 * (commit 868331f, src/lib/state/app.svelte.ts).
 */
import { loadTicker, roundPrice, PriceFetchError } from 'commun-crypto/binance';
import type { Dec } from 'commun-crypto/money';
import { convertAmounts, eurUsdcRate, FX_PAIR, priceIn, rateText, readAmount, SYMBOL, type Currency } from 'commun-crypto/currency';
import { openLocalStore } from 'commun-crypto/storage';
import { isTheme, type Theme } from 'commun-crypto/theme';
import { defaultForm, fixedPrice, moneyFields, sanitize, type Form } from '../core/form';
import { readShareFragment } from '../export/scenario';
import { BinanceDaily, type PriceHistory } from '../prices/history';
import { today } from '../core/dates';
import { minuteKlines, priceAt } from '../prices/at';
import { parisToUtcMs } from 'commun-crypto/klines';

export interface Settings {
  theme: Theme;
  /** Consentement aux appels à l'API publique de Binance (D-015 : opt-in, mémorisé, révocable). */
  allowPriceFetch: boolean;
}

export interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  form: Form;
}

const SETTINGS_KEY = 'reglages';
const FORM_KEY = 'formulaire';
const SCENARIOS_KEY = 'scenarios';
/** Nombre maximal de scénarios gardés. */
export const MAX_SCENARIOS = 30;

const toInput = (d: Dec) => d.toFixed().replace('.', ',');
const BAD_RESPONSE = 'Réponse de Binance illisible.';

function readScenarios(raw: unknown): SavedScenario[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedScenario[] = [];
  for (const item of raw.slice(0, MAX_SCENARIOS)) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const form = sanitize(s.form);
    if (!form || typeof s.id !== 'string' || typeof s.name !== 'string') continue;
    out.push({ id: s.id.slice(0, 40), name: s.name.slice(0, 60), savedAt: typeof s.savedAt === 'string' ? s.savedAt.slice(0, 30) : '', form });
  }
  return out;
}

class AppState {
  private readonly storage = openLocalStore('staking-crypto:');
  readonly persistent = this.storage.persistent;

  form = $state<Form>(defaultForm());
  settings = $state<Settings>({ theme: 'auto', allowPriceFetch: false });
  scenarios = $state<SavedScenario[]>([]);
  /** Le scénario vient d'un lien de partage (affiché une fois). */
  fromShare = $state(false);

  consentFor = $state<'price' | 'rate' | 'history' | 'start' | null>(null);

  /** Cours au début (D-023). */
  startPriceStatus = $state<'idle' | 'loading' | 'error'>('idle');
  startPriceMessage = $state<string | null>(null);
  startPriceRoute = $state<string | null>(null);
  private startRequest = 0;

  /** Historique des cours (D-021) : chargé pour un jeton, une devise et une période. */
  history = $state<PriceHistory | null>(null);
  historyStatus = $state<'idle' | 'loading' | 'error'>('idle');
  historyMessage = $state<string | null>(null);
  /** Clé du dernier historique demandé (réactive : les composants en dépendent). */
  private historyKey = $state('');
  private readonly daily = new BinanceDaily();

  priceStatus = $state<'idle' | 'loading' | 'error'>('idle');
  priceMessage = $state<string | null>(null);
  /** Chemin du dernier cours récupéré, ex. « ETHUSDC ». */
  priceRoute = $state<string | null>(null);

  rateStatus = $state<'idle' | 'loading' | 'error'>('idle');
  rateMessage = $state<string | null>(null);
  rateFromBinance = $state(false);

  /** Changement de devise en attente d'un taux (renfort D-019). */
  currencyPrompt = $state<Currency | null>(null);
  private switchAfterRate: Currency | null = null;

  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  init(hash = location.hash) {
    const saved = this.storage.readJson<Partial<Settings>>(SETTINGS_KEY);
    if (isTheme(saved?.theme)) this.settings.theme = saved.theme;
    if (saved?.allowPriceFetch === true) this.settings.allowPriceFetch = true;
    this.scenarios = readScenarios(this.storage.readJson(SCENARIOS_KEY));
    if (!this.openShare(hash)) {
      const form = sanitize(this.storage.readJson(FORM_KEY));
      if (form) this.form = form;
    }
  }

  /** Ouvre un lien de partage ; false si le fragment n'en est pas un. */
  openShare(hash: string): boolean {
    const shared = readShareFragment(hash);
    if (!shared) return false;
    this.form = shared;
    this.fromShare = true;
    this.clearSources();
    // Le lien a servi : on le retire de la barre d'adresse (il contient le scénario).
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  private clearSources() {
    this.priceRoute = null;
    this.priceMessage = null;
    this.rateFromBinance = false;
    this.rateMessage = null;
    this.currencyPrompt = null;
  }

  saveForm() {
    this.storage.writeJson(FORM_KEY, this.form);
  }

  resetForm() {
    this.form = defaultForm();
    this.storage.remove(FORM_KEY);
    this.clearSources();
    this.notify('Formulaire effacé.');
  }

  setTheme(theme: Theme) {
    this.settings.theme = theme;
    this.storage.writeJson(SETTINGS_KEY, this.settings);
  }

  setConsent(allow: boolean) {
    this.settings.allowPriceFetch = allow;
    this.storage.writeJson(SETTINGS_KEY, this.settings);
    if (!allow) this.consentFor = null;
  }

  // ---------- Scénarios enregistrés (D-007) ----------

  saveScenario(name: string) {
    const clean = name.trim().slice(0, 60) || `${this.form.asset || 'Scénario'} ${this.scenarios.length + 1}`;
    const existing = this.scenarios.find((s) => s.name === clean);
    const entry: SavedScenario = { id: existing?.id ?? crypto.randomUUID(), name: clean, savedAt: new Date().toISOString(), form: { ...this.form } };
    if (!existing && this.scenarios.length >= MAX_SCENARIOS) {
      this.notify(`${MAX_SCENARIOS} scénarios au plus : supprimez-en un d'abord.`);
      return;
    }
    this.scenarios = existing ? this.scenarios.map((s) => (s.id === existing.id ? entry : s)) : [entry, ...this.scenarios];
    this.storage.writeJson(SCENARIOS_KEY, this.scenarios);
    this.notify(existing ? `Scénario « ${clean} » mis à jour.` : `Scénario « ${clean} » enregistré.`);
  }

  loadScenario(id: string) {
    const s = this.scenarios.find((x) => x.id === id);
    if (!s) return;
    this.form = { ...s.form };
    this.clearSources();
    this.notify(`Scénario « ${s.name} » chargé.`);
  }

  deleteScenario(id: string) {
    const s = this.scenarios.find((x) => x.id === id);
    this.scenarios = this.scenarios.filter((x) => x.id !== id);
    this.storage.writeJson(SCENARIOS_KEY, this.scenarios);
    if (s) this.notify(`Scénario « ${s.name} » supprimé.`);
  }

  // ---------- Devise (D-014) ----------

  get rate(): Dec | null {
    try {
      const r = readAmount(this.form.fx);
      return r && r.gt(0) ? r : null;
    } catch {
      return null;
    }
  }

  setCurrency(to: Currency) {
    if (to === this.form.currency) {
      this.currencyPrompt = null;
      return;
    }
    const rate = this.rate;
    if (rate) this.convertTo(to, rate);
    else this.currencyPrompt = to;
  }

  private convertTo(to: Currency, rate: Dec) {
    const from = this.form.currency;
    if (from === to) return;
    // Un cours fixé à 1 (USDC en dollars) n'est pas saisi : rien à convertir pour lui.
    const fields = moneyFields(this.form);
    const { form, converted } = convertAmounts(this.form, fields, from, to, rate);
    this.form = { ...form, currency: to };
    if (this.priceRoute) this.priceRoute = `${this.priceRoute} ${from === 'EUR' ? '×' : '÷'} ${FX_PAIR}`;
    this.currencyPrompt = null;
    this.notify(converted ? `Montants convertis en ${SYMBOL[to]} au taux ${rateText(rate)}.` : `Devise : ${SYMBOL[to]}.`);
  }

  switchWithoutConverting() {
    const to = this.currencyPrompt;
    if (!to) return;
    this.form.currency = to;
    this.priceRoute = null;
    this.currencyPrompt = null;
    this.notify(`Devise : ${SYMBOL[to]}. Montants inchangés.`);
  }

  cancelCurrencyPrompt() {
    this.currencyPrompt = null;
    this.switchAfterRate = null;
  }

  // ---------- Binance : cours du jour et taux (D-015) ----------

  requestPrice() {
    if (!this.settings.allowPriceFetch) {
      this.consentFor = 'price';
      return;
    }
    void this.fetchPrice();
  }

  requestRate(thenSwitchTo: Currency | null = null) {
    this.switchAfterRate = thenSwitchTo;
    if (!this.settings.allowPriceFetch) {
      this.consentFor = 'rate';
      return;
    }
    void this.fetchRate();
  }

  acceptAndFetch() {
    const what = this.consentFor;
    this.setConsent(true);
    this.consentFor = null;
    if (what === 'history') void this.loadHistory(this.pendingHistory);
    else if (what === 'start') void this.fetchStartPrice();
    else void (what === 'rate' ? this.fetchRate() : this.fetchPrice());
  }

  cancelConsent() {
    this.consentFor = null;
    this.switchAfterRate = null;
  }

  private takeRate(ticker: Map<string, Dec | null>, force: boolean): Dec | null {
    const rate = eurUsdcRate(ticker);
    if (rate && (force || this.form.fx.trim() === '' || this.rateFromBinance)) {
      this.form.fx = toInput(rate);
      this.rateFromBinance = true;
      this.rateStatus = 'idle';
      this.rateMessage = null;
    }
    return rate;
  }

  async fetchPrice() {
    const asset = this.form.asset.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,15}$/.test(asset)) {
      this.priceStatus = 'error';
      this.priceMessage = 'Indiquez d’abord le jeton (ex. ETH).';
      return;
    }
    if (fixedPrice(this.form)) return;
    this.priceStatus = 'loading';
    this.priceMessage = null;
    try {
      const ticker = await loadTicker();
      this.takeRate(ticker, false);
      const currency = this.form.currency;
      const quote = priceIn(currency, asset, ticker);
      if (!quote) {
        this.priceStatus = 'error';
        this.priceMessage =
          currency === 'EUR'
            ? `${asset} n’a pas de cours sur Binance (paires EUR, USDT, USDC ou BTC). Saisissez le cours à la main.`
            : `${asset} n’a pas de cours en dollars sur Binance (paires USDC, USDT ou via l’euro). Saisissez le cours à la main.`;
        return;
      }
      this.form.price = toInput(roundPrice(quote.price));
      this.priceRoute = quote.route;
      this.priceStatus = 'idle';
      this.notify(`Cours de ${asset} mis à jour depuis Binance.`);
    } catch (e) {
      this.priceStatus = 'error';
      this.priceMessage = `${e instanceof PriceFetchError ? e.message : BAD_RESPONSE} Saisissez le cours à la main.`;
    }
  }

  async fetchRate() {
    this.rateStatus = 'loading';
    this.rateMessage = null;
    const then = this.switchAfterRate;
    this.switchAfterRate = null;
    try {
      const rate = this.takeRate(await loadTicker(), true);
      if (!rate) {
        this.rateStatus = 'error';
        this.rateMessage = `Paire ${FX_PAIR} introuvable sur Binance. Saisissez le taux à la main.`;
        return;
      }
      if (then) this.convertTo(then, rate);
      else this.notify(`Taux mis à jour depuis Binance : ${rateText(rate)}.`);
    } catch (e) {
      this.rateStatus = 'error';
      this.rateMessage = `${e instanceof PriceFetchError ? e.message : BAD_RESPONSE} Saisissez le taux à la main.`;
    }
  }

  // ---------- Cours à la date et l'heure de début (D-023) ----------

  /**
   * Date, heure, jeton ou devise du début modifiés : cherche le cours à cet
   * instant (consentement la première fois). Remplace le cours au début saisi.
   */
  startChanged() {
    const date = this.form.startDate.trim();
    this.startPriceRoute = null;
    if (!date || date >= today() || fixedPrice(this.form)) return;
    if (!this.settings.allowPriceFetch) {
      this.consentFor = 'start';
      return;
    }
    void this.fetchStartPrice();
  }

  requestStartPrice() {
    if (!this.settings.allowPriceFetch) {
      this.consentFor = 'start';
      return;
    }
    void this.fetchStartPrice();
  }

  private async fetchStartPrice() {
    const asset = this.form.asset.trim().toUpperCase();
    const date = this.form.startDate.trim();
    const time = this.form.startTime.trim() || '00:00';
    if (!/^[A-Z0-9]{1,15}$/.test(asset) || !date) {
      this.startPriceStatus = 'error';
      this.startPriceMessage = 'Indiquez d’abord le jeton et la date de début.';
      return;
    }
    let utcMs: number;
    try {
      utcMs = parisToUtcMs(`${date}T${time}`);
    } catch {
      return;
    }
    const id = ++this.startRequest;
    const currency = this.form.currency;
    this.startPriceStatus = 'loading';
    this.startPriceMessage = null;
    try {
      const found = await priceAt((symbol, ms) => minuteKlines.close(symbol, ms), asset, currency, utcMs);
      if (id !== this.startRequest) return;
      if (!found) {
        this.startPriceStatus = 'error';
        this.startPriceMessage = `Pas de cours de ${asset} sur Binance à cette date et cette heure. Saisissez-le à la main.`;
        return;
      }
      this.form.startPrice = toInput(roundPrice(found.price));
      this.startPriceRoute = found.route;
      this.startPriceStatus = 'idle';
    } catch (e) {
      if (id !== this.startRequest) return;
      this.startPriceStatus = 'error';
      this.startPriceMessage = `${e instanceof PriceFetchError ? e.message : BAD_RESPONSE} Saisissez le cours à la main.`;
    }
  }

  // ---------- Historique des cours (D-021) ----------

  private pendingHistory: { asset: string; currency: Currency; from: string } | null = null;

  /** Historique déjà chargé pour ces paramètres ? */
  historyFor(asset: string, currency: Currency, from: string): PriceHistory | null {
    return this.historyKey === `${asset}|${currency}|${from}|${today()}` ? this.history : null;
  }

  /** Demande l'historique : consentement la première fois, puis chargement. */
  requestHistory(asset: string, currency: Currency, from: string) {
    this.pendingHistory = { asset, currency, from };
    if (!this.settings.allowPriceFetch) {
      this.consentFor = 'history';
      return;
    }
    void this.loadHistory(this.pendingHistory);
  }

  /** Chargement automatique (consentement déjà donné), une fois par jeu de paramètres. */
  autoHistory(asset: string, currency: Currency, from: string) {
    if (!this.settings.allowPriceFetch || this.historyStatus === 'loading') return;
    if (this.historyKey === `${asset}|${currency}|${from}|${today()}`) return;
    void this.loadHistory({ asset, currency, from });
  }

  private async loadHistory(p: { asset: string; currency: Currency; from: string } | null) {
    if (!p) return;
    const to = today();
    const key = `${p.asset}|${p.currency}|${p.from}|${to}`;
    this.historyKey = key;
    this.historyStatus = 'loading';
    this.historyMessage = null;
    try {
      const h = await this.daily.history(p.asset, p.currency, p.from, to);
      if (this.historyKey !== key) return;
      this.history = h;
      this.historyStatus = 'idle';
      if (!h.first) {
        this.historyStatus = 'error';
        this.historyMessage = `Aucun cours de ${p.asset} sur Binance pour cette période.`;
      }
    } catch (e) {
      if (this.historyKey !== key) return;
      this.historyStatus = 'error';
      this.historyMessage = `${e instanceof PriceFetchError ? e.message : BAD_RESPONSE} Réessayez plus tard.`;
      this.historyKey = '';
    }
  }

  notify(message: string) {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3500);
  }
}

export const app = new AppState();
