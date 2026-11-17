<!--
  Formulaire du scénario (SPEC § 4). Structure, devise et consentement Binance
  repris de renfort-crypto (commit 868331f, PositionForm.svelte).
-->
<script lang="ts">
  import { app } from '../state/app.svelte';
  import { FIRST_DATE, fixedPrice, type Field } from '../core/form';
  import { dateText, today } from '../core/dates';
  import { SYMBOL, type Currency } from 'commun-crypto/currency';

  interface Props {
    /** Erreurs de format à afficher (les champs simplement vides n'en font pas partie). */
    errors: Partial<Record<Field, string>>;
  }
  let { errors }: Props = $props();

  const asset = $derived(app.form.asset.trim().toUpperCase() || 'jeton');
  const sym = $derived(SYMBOL[app.form.currency]);
  const priceFixed = $derived(fixedPrice(app.form));
  const past = $derived(app.form.startDate.trim() !== '' && app.form.startDate < today());
  const maxDate = today();
  const CURRENCY_ORDER: Currency[] = ['USD', 'EUR'];
  const CURRENCY_LABEL: Record<Currency, string> = { USD: '$ dollar (USDC)', EUR: '€ euro' };
  const err = (f: Field) => errors[f];
  const describedBy = (f: Field, hint?: string) => [hint, errors[f] ? `${f}-err` : ''].filter(Boolean).join(' ') || undefined;

  function onCurrencyKey(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next: Currency = app.form.currency === 'EUR' ? 'USD' : 'EUR';
    app.setCurrency(next);
    document.getElementById(`cur-${next}`)?.focus();
  }
</script>

{#snippet consent(what: string)}
  <div class="consent wide" role="group" aria-labelledby="consent-title">
    <p id="consent-title"><strong>Récupérer {what} sur Binance ?</strong></p>
    <p>
      L'outil demandera à l'API publique de Binance la liste de tous les cours. Rien d'autre n'est envoyé : ni le jeton choisi, ni montant. Votre adresse IP est
      visible de Binance, comme pour toute page web. Ce choix est mémorisé sur cet appareil.
    </p>
    <div class="actions">
      <button class="btn btn-primary btn-small" type="button" onclick={() => app.acceptAndFetch()}>Autoriser et récupérer</button>
      <button class="btn btn-small" type="button" onclick={() => app.cancelConsent()}>Saisir à la main</button>
    </div>
  </div>
{/snippet}

{#snippet field(id: Field, label: string, placeholder: string, hint?: string)}
  <label class="field">
    <span>{label}</span>
    <input
      bind:value={app.form[id]}
      inputmode="decimal"
      autocomplete="off"
      {placeholder}
      aria-invalid={!!err(id)}
      aria-describedby={describedBy(id, hint ? `${id}-hint` : undefined)}
    />
    {#if hint}<small id={`${id}-hint`}>{hint}</small>{/if}
    {#if err(id)}<small id={`${id}-err`} class="error">{err(id)}</small>{/if}
  </label>
{/snippet}

<form class="panel params" aria-labelledby="stake-title" onsubmit={(e) => e.preventDefault()} novalidate>
  <fieldset>
    <legend id="stake-title"><h2>Votre staking</h2></legend>
    <div class="grid">
      <div class="field wide">
        <span class="label" id="cur-label">Devise des montants</span>
        <div class="modes" role="radiogroup" aria-labelledby="cur-label">
          {#each CURRENCY_ORDER as c (c)}
            <button
              id={`cur-${c}`}
              type="button"
              role="radio"
              aria-checked={app.form.currency === c}
              tabindex={app.form.currency === c ? 0 : -1}
              onclick={() => app.setCurrency(c)}
              onkeydown={onCurrencyKey}>{CURRENCY_LABEL[c]}</button
            >
          {/each}
        </div>
      </div>

      {#if app.currencyPrompt}
        {@const to = SYMBOL[app.currencyPrompt]}
        <div class="consent wide" role="group" aria-labelledby="switch-title">
          <p id="switch-title"><strong>Convertir vos montants en {to} ?</strong></p>
          <p>Il faut le taux EUR/USDC : récupérez-le sur Binance, ou saisissez-le ci-dessous puis choisissez à nouveau la devise.</p>
          <div class="actions">
            <button class="btn btn-primary btn-small" type="button" onclick={() => app.requestRate(app.currencyPrompt)} disabled={app.rateStatus === 'loading'}
              >Taux du jour et convertir</button
            >
            <button class="btn btn-small" type="button" onclick={() => app.switchWithoutConverting()}>Mes montants sont déjà en {to}</button>
            <button class="btn btn-small btn-quiet" type="button" onclick={() => app.cancelCurrencyPrompt()}>Annuler</button>
          </div>
        </div>
      {/if}

      <div class="field wide">
        <label for="fx"><span class="label">Taux EUR/USDC (facultatif)</span></label>
        <div class="with-btn">
          <span class="prefix" aria-hidden="true">1 € =</span>
          <input
            id="fx"
            bind:value={app.form.fx}
            oninput={() => (app.rateFromBinance = false)}
            inputmode="decimal"
            autocomplete="off"
            placeholder="1,08"
            aria-invalid={!!err('fx')}
            aria-describedby={describedBy('fx', 'fx-hint')}
          />
          <span class="suffix" aria-hidden="true">$</span>
          <button class="btn btn-small" type="button" onclick={() => app.requestRate()} disabled={app.rateStatus === 'loading'}>
            {app.rateStatus === 'loading' ? 'Chargement…' : 'Taux du jour'}
          </button>
        </div>
        <small id="fx-hint">
          {#if app.rateFromBinance}Cours spot Binance (EURUSDC), modifiable.{:else}Sert à changer de devise et à afficher l'équivalent dans l'autre.{/if}
        </small>
        {#if err('fx')}<small id="fx-err" class="error">{err('fx')}</small>{/if}
        {#if app.rateStatus === 'error' && app.rateMessage}<small class="error" role="alert">{app.rateMessage}</small>{/if}
      </div>
      {#if app.consentFor === 'rate'}{@render consent('le taux EUR/USDC')}{/if}

      <label class="field">
        <span>Jeton staké</span>
        <input
          bind:value={app.form.asset}
          oninput={() => (app.priceRoute = null)}
          onchange={() => app.startChanged()}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="15"
          placeholder="ETH"
          aria-invalid={!!err('asset')}
          aria-describedby={describedBy('asset')}
        />
        {#if err('asset')}<small id="asset-err" class="error">{err('asset')}</small>{/if}
      </label>

      <div class="field wide">
        <span class="label" id="start-label">Début du staking</span>
        <div class="with-unit" role="group" aria-labelledby="start-label">
          <input
            type="date"
            bind:value={app.form.startDate}
            onchange={() => app.startChanged()}
            min={FIRST_DATE}
            max={maxDate}
            aria-label="Date de début"
            aria-invalid={!!err('startDate')}
            aria-describedby={describedBy('startDate', 'startDate-hint')}
          />
          <input
            type="time"
            class="time"
            bind:value={app.form.startTime}
            onchange={() => app.startChanged()}
            aria-label="Heure de début (heure de Paris)"
            aria-invalid={!!err('startTime')}
            aria-describedby={describedBy('startTime', 'startDate-hint')}
          />
        </div>
        <small id="startDate-hint">Vide : aujourd'hui. Heure de Paris.</small>
        {#if err('startDate')}<small id="startDate-err" class="error">{err('startDate')}</small>{/if}
        {#if err('startTime')}<small id="startTime-err" class="error">{err('startTime')}</small>{/if}
      </div>

      {#if past && !priceFixed}
        <div class="field wide">
          <label for="startPrice"><span class="label">Cours au début ({sym})</span></label>
          <div class="with-btn">
            <input
              id="startPrice"
              bind:value={app.form.startPrice}
              oninput={() => (app.startPriceRoute = null)}
              inputmode="decimal"
              autocomplete="off"
              placeholder="2 450"
              aria-invalid={!!err('startPrice')}
              aria-describedby={describedBy('startPrice', 'startPrice-hint')}
            />
            <button class="btn btn-small" type="button" onclick={() => app.requestStartPrice()} disabled={app.startPriceStatus === 'loading'}>
              {app.startPriceStatus === 'loading' ? 'Chargement…' : 'Cours à cette date'}
            </button>
          </div>
          <small id="startPrice-hint">
            {#if app.startPriceRoute}Binance, bougie d'une minute ({app.startPriceRoute}), modifiable.{:else}Cherché sur Binance quand vous changez la date ou l'heure. Sert à convertir un montant en {sym} et à mesurer l'effet du cours.{/if}
          </small>
          {#if err('startPrice')}<small id="startPrice-err" class="error">{err('startPrice')}</small>{/if}
          {#if app.startPriceStatus === 'error' && app.startPriceMessage}<small class="error" role="alert">{app.startPriceMessage}</small>{/if}
        </div>
        {#if app.consentFor === 'start'}{@render consent(`le cours de ${asset} au ${dateText(app.form.startDate)} à ${app.form.startTime || '00:00'}`)}{/if}
      {/if}

      <div class="field wide">
        <label for="price"><span class="label">{past ? 'Cours actuel' : 'Cours'} ({sym})</span></label>
        {#if priceFixed}
          <input id="price" value="1" disabled aria-describedby="price-hint" />
          <small id="price-hint">USDC compté en dollars : 1 $.</small>
        {:else}
          <div class="with-btn">
            <input
              id="price"
              bind:value={app.form.price}
              oninput={() => (app.priceRoute = null)}
              inputmode="decimal"
              autocomplete="off"
              placeholder="2 500"
              aria-invalid={!!err('price')}
              aria-describedby={describedBy('price', 'price-hint')}
            />
            <button class="btn btn-small" type="button" onclick={() => app.requestPrice()} disabled={app.priceStatus === 'loading'}>
              {app.priceStatus === 'loading' ? '…' : 'Cours du jour'}
            </button>
          </div>
          <small id="price-hint">
            {#if app.priceRoute}Binance ({app.priceRoute}), modifiable.{:else}Supposé constant à partir d'aujourd'hui. Requis pour les frais et un montant en {sym}.{/if}
          </small>
          {#if err('price')}<small id="price-err" class="error">{err('price')}</small>{/if}
          {#if app.priceStatus === 'error' && app.priceMessage}<small class="error" role="alert">{app.priceMessage}</small>{/if}
        {/if}
      </div>
      {#if app.consentFor === 'price'}{@render consent(`le cours de ${asset}`)}{/if}

      <div class="field">
        <label for="amount"><span class="label">Montant staké</span></label>
        <div class="with-unit">
          <input
            id="amount"
            bind:value={app.form.amount}
            inputmode="decimal"
            autocomplete="off"
            placeholder={app.form.amountUnit === 'token' ? '1' : '2 500'}
            aria-invalid={!!err('amount')}
            aria-describedby={describedBy('amount')}
          />
          <select bind:value={app.form.amountUnit} aria-label="Unité du montant staké">
            <option value="token">{asset}</option>
            <option value="money">{sym}</option>
          </select>
        </div>
        {#if err('amount')}<small id="amount-err" class="error">{err('amount')}</small>{/if}
      </div>

      <div class="field">
        <label for="rate"><span class="label">Taux annuel (%)</span></label>
        <div class="with-unit">
          <input
            id="rate"
            bind:value={app.form.rate}
            inputmode="decimal"
            autocomplete="off"
            placeholder="4"
            aria-invalid={!!err('rate')}
            aria-describedby={describedBy('rate', 'rate-hint')}
          />
          <select bind:value={app.form.rateType} aria-label="Type de taux">
            <option value="APR">APR</option>
            <option value="APY">APY</option>
          </select>
        </div>
        <small id="rate-hint">APR : sans intérêts composés. APY : déjà composé (converti, jamais divisé).</small>
        {#if err('rate')}<small id="rate-err" class="error">{err('rate')}</small>{/if}
      </div>

      <div class="field">
        <label for="duration"><span class="label">Durée</span></label>
        <div class="with-unit">
          <input id="duration" bind:value={app.form.duration} inputmode="decimal" autocomplete="off" placeholder="1" aria-invalid={!!err('duration')} aria-describedby={describedBy('duration')} />
          <select bind:value={app.form.durationUnit} aria-label="Unité de durée">
            <option value="days">jours</option>
            <option value="months">mois</option>
            <option value="years">ans</option>
          </select>
        </div>
        {#if err('duration')}<small id="duration-err" class="error">{err('duration')}</small>{/if}
      </div>

      {@render field('commission', 'Commission (%)', '0', 'Prélevée sur les rewards. 0 si le taux affiché est déjà net.')}
    </div>
  </fieldset>

  <fieldset>
    <legend><h2>Compound et frais</h2></legend>
    <div class="grid">
      <label class="field">
        <span>Fréquence de compound</span>
        <select bind:value={app.form.frequency}>
          <option value="none">Aucun</option>
          <option value="daily">Chaque jour</option>
          <option value="weekly">Chaque semaine</option>
          <option value="monthly">Chaque mois</option>
          <option value="custom">Personnalisée</option>
        </select>
      </label>
      {#if app.form.frequency === 'custom'}
        {@render field('perYear', 'Compounds par an', '24', 'Nombre entier, de 1 à 365.')}
      {:else}
        <span class="spacer" aria-hidden="true"></span>
      {/if}
      {@render field('compoundFee', `Frais par compound (${sym})`, '0,50', 'Gas du claim et du restake.')}
      {@render field('entryFee', `Frais d'entrée (${sym})`, '0', 'Payés une fois au départ.')}
      {@render field('exitFee', `Frais de sortie (${sym})`, '0', 'Unstake et dernier claim.')}
    </div>
    {#if app.settings.allowPriceFetch}
      <p class="revoke muted">
        Binance autorisé sur cet appareil.
        <button type="button" class="link" onclick={() => app.setConsent(false)}>Retirer l'autorisation</button>
      </p>
    {/if}
  </fieldset>

  <p class="reset">
    <button type="button" class="link muted" onclick={() => app.resetForm()}>Effacer le formulaire</button>
  </p>
</form>

<style>
  .params {
    padding: 1.1rem 1.1rem 0.9rem;
    display: grid;
    gap: 1.25rem;
    align-content: start;
  }
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: grid;
    gap: 0.8rem;
  }
  legend {
    padding: 0;
    margin-bottom: 0.8rem;
  }
  h2 {
    font-size: 1.15rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem 0.9rem;
    align-items: start;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .field .label {
    font-size: 0.85rem;
    font-weight: 550;
  }
  .with-btn,
  .with-unit {
    display: flex;
    gap: 0.4rem;
  }
  .with-btn input,
  .with-unit input {
    flex: 1;
    min-width: 0;
  }
  .with-unit .time {
    flex: 0 0 9rem;
  }
  .with-unit select {
    width: auto;
    flex: 0 0 auto;
  }
  .prefix,
  .suffix {
    align-self: center;
    color: var(--muted);
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .consent {
    display: grid;
    gap: 0.5rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 0.9rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .revoke {
    font-size: 0.82rem;
  }
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    padding: 3px;
    gap: 3px;
    background: var(--surface-2);
  }
  .modes button {
    font: inherit;
    font-size: 0.9rem;
    font-weight: 550;
    border: 0;
    border-radius: calc(var(--radius) - 2px);
    padding: 0.45rem 0.5rem;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .modes button[aria-checked='true'] {
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--rule-strong);
  }
  .link {
    font: inherit;
    background: none;
    border: 0;
    padding: 0;
    color: var(--accent);
    text-decoration: underline;
    cursor: pointer;
  }
  .reset {
    font-size: 0.85rem;
    border-top: 1px solid var(--rule);
    padding-top: 0.7rem;
  }
  .reset .link {
    color: var(--muted);
  }
  @media (max-width: 420px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .spacer {
      display: none;
    }
  }
</style>
