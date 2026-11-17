<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ThemeToggle from 'commun-crypto/ui/ThemeToggle.svelte';
  import Support from 'commun-crypto/ui/Support.svelte';
  import { applyTheme } from 'commun-crypto/theme';
  import { AUTHOR } from 'commun-crypto/support';
  import { dec } from 'commun-crypto/money';
  import { qty } from 'commun-crypto/format';
  import { settings } from './lib/state/settings.svelte';
  import { SUPPORT_INTRO } from './lib/ui/supportIntro';
  import About from './lib/ui/About.svelte';
  import { breakEvenCapital, compare, type StakingInput } from './lib/core/staking';

  // Deux vues : l'accueil (calculateur à venir en J2) et « À propos et limites » (#a-propos).
  const readView = () => (location.hash === '#a-propos' ? 'a-propos' : 'accueil');
  let view = $state<'accueil' | 'a-propos'>(readView());

  onMount(() => {
    settings.init();
    const onHash = () => {
      view = readView();
      if (view === 'a-propos') {
        scrollTo(0, 0);
        void tick().then(() => document.getElementById('about-title')?.focus());
      }
    };
    addEventListener('hashchange', onHash);
    if (view === 'a-propos') void tick().then(() => document.getElementById('about-title')?.focus());
    return () => removeEventListener('hashchange', onHash);
  });

  $effect(() => {
    applyTheme(settings.theme);
  });

  // Exemple de démonstration, calculé par le moteur : 1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound, 1 an.
  const EXAMPLE: StakingInput = {
    amount: dec('1'),
    rate: dec('0.04'),
    rateType: 'APR',
    years: dec('1'),
    commission: dec('0.10'),
    compoundFee: dec('0.0002'),
    entryFee: dec('0'),
    exitFee: dec('0'),
  };
  const example = compare(EXAMPLE, 365);
  const eth = (d: ReturnType<typeof dec>) => `${qty(d)} ETH`;
  const dailyBreakEven = breakEvenCapital(EXAMPLE, 365)!;
</script>

<a class="skip" href="#contenu">Aller au contenu</a>

<header class="top">
  <div class="top-inner">
    <div class="brand">
      <a class="brand-name" href="./" aria-label="staking-crypto, accueil">staking-crypto</a>
      <span class="brand-tag"
        ><span class="tagline">Rendement de staking, avec ou sans compound ·&nbsp;</span>par
        <a href={AUTHOR.url} target="_blank" rel="noopener author">{AUTHOR.name} ({AUTHOR.handle})</a></span
      >
    </div>
    <div class="top-actions">
      <span class="local" title="Aucune donnée n'est envoyée sur Internet">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
          ><path d="M8 1.5 2.5 3.8v3.7c0 3.2 2.3 6 5.5 7 3.2-1 5.5-3.8 5.5-7V3.8L8 1.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg
        >
        100 % local
      </span>
      <ThemeToggle theme={settings.theme} onchange={(t) => settings.setTheme(t)} />
    </div>
  </div>
</header>

<main id="contenu" tabindex="-1">
  {#if view === 'a-propos'}
    <About />
  {:else}
    <section class="start" aria-labelledby="start-title">
      <h1 id="start-title">Compounder vos rewards de staking vaut-il ses frais ?</h1>
      <p>
        Le calculateur compare le rendement <strong>sans</strong> et <strong>avec</strong> intérêts composés, commission et frais de transaction compris, en dollars ou
        en euros, et trouve la fréquence de compound qui rapporte le plus. Il arrive bientôt : cette page en montre le moteur de calcul.
      </p>
      <h2>Un exemple</h2>
      <p>1 ETH staké un an à 4 % (APR), commission de 10 %, 0,0002 ETH de frais par compound :</p>
      <div class="example">
        <table>
          <caption class="sr-only">Solde final selon la stratégie</caption>
          <thead><tr><th scope="col">Stratégie</th><th scope="col" class="num">Solde final</th></tr></thead>
          <tbody>
            <tr><th scope="row">Sans compound</th><td class="num">{eth(example.simple.finalBalance)}</td></tr>
            <tr><th scope="row">Compound quotidien ({example.chosen.compounds} compounds)</th><td class="num">{eth(example.chosen.finalBalance)}</td></tr>
            <tr
              ><th scope="row">Meilleure fréquence : {example.optimal.perYear} par an ({example.optimal.compounds} compound)</th><td class="num"
                >{eth(example.optimal.finalBalance)}</td
              ></tr
            >
          </tbody>
        </table>
      </div>
      <p>
        Compounder tous les jours fait <strong>perdre</strong> de l'ETH : chaque compound coûte plus qu'il ne rapporte tant que le capital reste sous {qty(dailyBreakEven.toDecimalPlaces(2), 2)} ETH. La
        meilleure fréquence gagne à peine plus que ne rien faire.
      </p>
      <p class="muted small">Tout le calcul se fait dans votre navigateur : rien n'est envoyé. Méthode et limites : <a href="#a-propos">À propos et limites</a>.</p>
    </section>
  {/if}
</main>

<footer class="foot">
  <p>
    Outil d'aide au calcul, pas un conseil en investissement. Code source libre (AGPL-3.0) sur
    <a href="https://github.com/Patart50/staking-crypto" rel="noopener" target="_blank">GitHub</a> ·
    <a href="#a-propos">À propos et limites</a> · v{__APP_VERSION__}
  </p>
  <p class="credit">
    Créé par <a href={AUTHOR.url} target="_blank" rel="noopener author">{AUTHOR.name} ({AUTHOR.handle})</a> · <Support intro={SUPPORT_INTRO} />
  </p>
</footer>

<style>
  .skip {
    position: absolute;
    left: 1rem;
    top: -3rem;
    z-index: 100;
    background: var(--accent);
    color: var(--on-accent);
    padding: 0.5rem 0.8rem;
    border-radius: var(--radius);
    font-weight: 600;
  }
  .skip:focus {
    top: 0.5rem;
  }
  main:focus {
    outline: none;
  }
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--rule);
  }
  .top-inner,
  main,
  .foot {
    max-width: 74rem;
    margin: 0 auto;
    padding-inline: 1rem;
  }
  .top-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.9rem;
  }
  .brand {
    display: grid;
  }
  .brand-name {
    text-decoration: none;
    color: var(--ink);
    width: fit-content;
    font-family: var(--font-doc);
    font-size: 1.45rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .brand-tag {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .top-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .local {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--gain);
    padding-inline: 0.4rem;
  }
  main {
    padding-block: 1.5rem 3rem;
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
  .start {
    display: grid;
    gap: 0.9rem;
    max-width: 44rem;
    padding: 0.5rem 0;
  }
  .start h1 {
    font-size: 1.7rem;
  }
  .start h2 {
    font-size: 1.2rem;
  }
  .example {
    min-width: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  th,
  td {
    text-align: left;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--rule);
  }
  tbody th {
    white-space: normal;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .small {
    font-size: 0.85rem;
  }
  .foot {
    padding-block: 0 2.5rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .foot p:first-child {
    border-top: 1px solid var(--rule);
    padding-top: 1.5rem;
  }
  .credit {
    margin-top: 0.4rem;
  }
  @media (max-width: 640px) {
    .tagline,
    .local {
      display: none;
    }
  }
</style>
