<!--
  Garder ou partager (D-007, D-008) : scénarios enregistrés sur l'appareil, CSV,
  résumé copiable, lien de partage. Repris de renfort-crypto (commit 868331f,
  ExportPanel.svelte), scénarios ajoutés.
-->
<script lang="ts">
  import type { Dec } from 'commun-crypto/money';
  import type { Result } from '../core/form';
  import { comparisonCsv, scheduleCsv, shareFragment, summaryText } from '../export/scenario';
  import { app, MAX_SCENARIOS } from '../state/app.svelte';

  interface Props {
    result: Result;
    sentence: string;
    amount: (d: Dec) => string;
  }
  let { result, sentence, amount }: Props = $props();

  let shareUrl = $state<string | null>(null);
  let shareInput: HTMLInputElement | undefined = $state();
  let name = $state('');

  // Le lien ne vaut que pour le scénario affiché au moment où il a été créé.
  $effect(() => {
    JSON.stringify(app.form);
    shareUrl = null;
  });

  const slug = $derived((result.values.asset || 'jeton').toLowerCase());

  function download(text: string, file: string) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy(text: string, done: string, fallback?: HTMLInputElement) {
    try {
      await navigator.clipboard.writeText(text);
      app.notify(done);
    } catch {
      if (fallback) {
        fallback.select();
        app.notify('Copie automatique impossible : le texte est sélectionné, copiez-le (Ctrl+C).');
      } else app.notify('Copie automatique impossible dans ce navigateur.');
    }
  }

  function createLink() {
    shareUrl = location.origin + location.pathname + shareFragment(app.form);
    void copy(shareUrl, 'Lien copié.', shareInput);
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    app.saveScenario(name);
    name = '';
  }

  const dateText = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };
</script>

<section class="panel export" aria-labelledby="export-title">
  <h2 id="export-title">Garder ou partager ce scénario</h2>

  <form class="save" onsubmit={save}>
    <label class="field">
      <span>Nom du scénario</span>
      <input bind:value={name} maxlength="60" autocomplete="off" placeholder={`${result.values.asset || 'Jeton'} ${app.scenarios.length + 1}`} />
    </label>
    <button class="btn btn-primary" type="submit">Enregistrer</button>
  </form>
  <p class="muted small">
    Sur cet appareil seulement, dans ce navigateur ({MAX_SCENARIOS} au plus). Un nom déjà pris remplace l'ancien scénario.{#if !app.persistent}
      <strong> Stockage bloqué : rien ne sera gardé après fermeture.</strong>{/if}
  </p>

  <div class="actions">
    <button class="btn" type="button" onclick={() => download(comparisonCsv(result), `staking-${slug}-comparaison.csv`)}>CSV de la comparaison</button>
    <button class="btn" type="button" onclick={() => download(scheduleCsv(result), `staking-${slug}-echeancier.csv`)}>CSV de l'échéancier</button>
    <button class="btn" type="button" onclick={() => copy(summaryText(result, amount, sentence), 'Résumé copié.')}>Copier le résumé</button>
  </div>

  <div class="share">
    <h3>Lien de partage</h3>
    <p class="small">
      Le lien contient votre scénario (montant, taux, frais) : toute personne qui le reçoit le verra. Les paramètres sont placés après le « # » de l'adresse, une partie
      qui n'est jamais envoyée au serveur.
    </p>
    <div class="actions">
      <button class="btn" type="button" onclick={createLink}>Créer et copier le lien</button>
    </div>
    {#if shareUrl}
      <label class="field">
        <span>Lien</span>
        <input bind:this={shareInput} readonly value={shareUrl} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
      </label>
    {/if}
  </div>
</section>

{#if app.scenarios.length}
  <section class="panel export" aria-labelledby="saved-title">
    <h2 id="saved-title">Scénarios enregistrés</h2>
    <ul class="saved">
      {#each app.scenarios as s (s.id)}
        <li>
          <span class="name">{s.name}</span>
          <span class="muted small">{s.form.amount} {s.form.amountUnit === 'token' ? s.form.asset : s.form.currency === 'USD' ? '$' : '€'} · {s.form.rate} % {s.form.rateType} · {dateText(s.savedAt)}</span>
          <span class="row-actions">
            <button class="btn btn-small" type="button" onclick={() => app.loadScenario(s.id)} aria-label={`Charger le scénario ${s.name}`}>Charger</button>
            <button class="btn btn-small btn-quiet" type="button" onclick={() => app.deleteScenario(s.id)} aria-label={`Supprimer le scénario ${s.name}`}>Supprimer</button>
          </span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .export {
    padding: 1.1rem;
    display: grid;
    gap: 0.75rem;
  }
  h2 {
    font-size: 1.15rem;
  }
  h3 {
    font-size: 1rem;
  }
  .save {
    display: flex;
    gap: 0.5rem;
    align-items: end;
    flex-wrap: wrap;
  }
  .save .field {
    flex: 1 1 12rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .share {
    display: grid;
    gap: 0.5rem;
    border-top: 1px solid var(--rule);
    padding-top: 0.8rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .saved {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .saved li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.1rem 0.8rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--rule);
    align-items: center;
  }
  .saved .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .saved .muted {
    grid-column: 1;
  }
  .row-actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    gap: 0.4rem;
  }
</style>
