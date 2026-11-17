<!--
  Résultats (SPEC § 4) : synthèse, comparaison en trois colonnes, graphiques,
  export. Mise en page reprise de renfort-crypto (commit 868331f, Results.svelte).
-->
<script lang="ts">
  import { D, type Dec } from 'commun-crypto/money';
  import { qty, pct } from 'commun-crypto/format';
  import { convert, formatter } from 'commun-crypto/currency';
  import { frequencyText, summary, type Result } from '../core/form';
  import { DAYS_PER_YEAR, type Outcome } from '../core/staking';
  import LinesChart from './LinesChart.svelte';
  import ExportPanel from './ExportPanel.svelte';

  interface Props {
    result: Result;
  }
  let { result }: Props = $props();

  const v = $derived(result.values);
  const c = $derived(result.comparison);
  const f = $derived(formatter(v.currency));
  const asset = $derived(v.asset || 'jetons');
  const other = $derived(v.currency === 'EUR' ? 'USD' : 'EUR');

  /** « 1,0361204 ETH (2 590,30 $) ». */
  const amount = (d: Dec) => `${qty(d)} ${asset}${v.price ? ` (${f.money(d.times(v.price))})` : ''}`;
  const tokens = (d: Dec) => `${qty(d)} ${asset}`;
  const signedTokens = (d: Dec) => `${d.isNeg() ? '−' : d.isZero() ? '' : '+'}${qty(d.abs())} ${asset}`;
  const money = (d: Dec) => (v.price ? f.money(d.times(v.price)) : null);
  const signedMoney = (d: Dec) => (v.price ? f.signed(d.times(v.price)) : null);
  const otherMoney = (d: Dec) => (v.price && v.fx ? formatter(other).money(convert(d.times(v.price), v.currency, other, v.fx)) : null);

  const sentence = $derived(summary(result, amount));

  interface Column {
    key: 'simple' | 'chosen' | 'optimal';
    label: string;
    o: Outcome;
  }
  const columns = $derived.by<Column[]>(() => {
    const cols: Column[] = [{ key: 'simple', label: 'Sans compound', o: c.simple }];
    if (v.perYear) cols.push({ key: 'chosen', label: `Votre choix : ${frequencyText(v.perYear)}`, o: c.chosen });
    if (!v.perYear || c.optimal.perYear !== v.perYear) cols.push({ key: 'optimal', label: `Meilleure fréquence : ${frequencyText(c.optimal.perYear)}`, o: c.optimal });
    return cols;
  });
  const bestKey = $derived(c.best === 'optimal' && v.perYear === c.optimal.perYear ? 'chosen' : c.best);
  const top = $derived(columns.find((col) => col.key === bestKey) ?? columns[0]);

  const notes = $derived.by(() => {
    const out: string[] = [];
    if (c.chosen.status === 'deficit' && v.perYear)
      out.push(
        `En compoundant ${frequencyText(v.perYear)}, chaque compound coûte plus qu'il ne rapporte tant que le capital reste sous ${result.breakEven ? tokens(result.breakEven) : 'le point mort'} : le solde baisse à chaque opération.`,
      );
    else if (result.breakEven && v.perYear) out.push(`Point mort en compoundant ${frequencyText(v.perYear)} : un compound rapporte plus qu'il ne coûte au-dessus de ${tokens(result.breakEven)} stakés.`);
    if (c.chosen.status === 'depleted' && v.perYear) out.push('À cette fréquence, les frais finissent par manger tout le capital.');
    if (c.chosen.status === 'no-period' && v.perYear) out.push('La durée est trop courte pour qu’un compound ait lieu à cette fréquence : les deux stratégies sont identiques.');
    if (c.simple.netGain.isNeg()) out.push('Même sans compound, les frais dépassent les rewards : le staking est perdant sur cette durée.');
    if (v.input.years.lt(1)) out.push('Durée de moins d’un an : l’APY effectif est annualisé, et les frais fixes pèsent lourd.');
    return out;
  });

  // ---------- Graphiques ----------
  const days = (d: Dec) => d;
  const balanceSeries = $derived([
    { name: 'Sans compound', color: 'var(--series-muted)', dashed: true, points: result.series.simple.map((p) => ({ x: days(p.day), y: p.balance })) },
    ...(result.series.chosen && v.perYear ? [{ name: `Votre choix (${v.perYear}/an)`, color: 'var(--series-2)', points: result.series.chosen.map((p) => ({ x: p.day, y: p.balance })) }] : []),
    ...(!v.perYear || c.optimal.perYear !== v.perYear
      ? [{ name: `Meilleure fréquence (${c.optimal.perYear}/an)`, color: 'var(--series-1)', points: result.series.optimal.map((p) => ({ x: p.day, y: p.balance })) }]
      : []),
  ]);
  const totalDays = $derived(v.input.years.times(DAYS_PER_YEAR).toNumber());
  const fmtDays = (n: number) => (totalDays > 3 * 365 ? `${(n / 365).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} an` : `${Math.round(n)} j`);
  const tokenAxis = (n: number) => `${n.toLocaleString('fr-FR', { maximumSignificantDigits: 6 })}`;

  const curveSeries = $derived([{ name: 'Solde final', color: 'var(--series-1)', points: c.curve.map((o) => ({ x: new D(o.perYear), y: o.finalBalance })) }]);
  const curveMarkers = $derived([
    { x: new D(c.optimal.perYear), y: c.optimal.finalBalance, label: `Optimum : ${c.optimal.perYear}/an`, color: 'var(--series-1)' },
    ...(v.perYear && v.perYear !== c.optimal.perYear ? [{ x: new D(v.perYear), y: c.chosen.finalBalance, label: `Votre choix : ${v.perYear}/an`, color: 'var(--series-2)' }] : []),
  ]);
  const curveSummary = $derived(
    `Solde final selon le nombre de compounds par an : ${tokens(c.curve[0].finalBalance)} pour 1, ${tokens(c.optimal.finalBalance)} au mieux pour ${c.optimal.perYear}, ${tokens(c.curve[364].finalBalance)} pour 365. Sans compound : ${tokens(c.simple.finalBalance)}.`,
  );
  const balanceSummary = $derived(
    `Solde dans le temps, sur ${Math.round(totalDays)} jours : ${columns.map((col) => `${col.label.toLowerCase()}, ${tokens(col.o.finalBalance)} à la fin`).join(' ; ')}.`,
  );
</script>

<div class="results">
  <section class="panel key" aria-labelledby="res-title">
    <h2 id="res-title">Résultat</h2>
    <p class="sentence" aria-live="polite">{sentence}</p>
    <dl class="figures">
      <div class="main">
        <dt>Solde final du meilleur choix</dt>
        <dd class="num">{tokens(top.o.finalBalance)}</dd>
        {#if money(top.o.finalBalance)}
          <dd class="sub">{money(top.o.finalBalance)} au cours supposé constant{#if otherMoney(top.o.finalBalance)} · {otherMoney(top.o.finalBalance)}{/if}</dd>
        {/if}
      </div>
      <div>
        <dt>Gain net</dt>
        <dd class="num" class:gain={top.o.netGain.gt(0)} class:loss={top.o.netGain.isNeg()}>{signedTokens(top.o.netGain)}</dd>
      </div>
      <div>
        <dt>APY effectif</dt>
        <dd class="num">{top.o.effectiveApy ? pct(top.o.effectiveApy.times(100)) : '—'}</dd>
      </div>
      <div>
        <dt>{v.rateType === 'APY' ? 'APR équivalent' : 'APY équivalent (compound quotidien, sans frais)'}</dt>
        <dd class="num">{v.rateType === 'APY' ? pct(result.apr.times(100)) : pct(result.apr.div(365).plus(1).pow(365).minus(1).times(100))}</dd>
      </div>
    </dl>
    {#each notes as note (note)}<p class="note">{note}</p>{/each}
  </section>

  <section class="panel block" aria-labelledby="cmp-title">
    <h2 id="cmp-title">Comparaison</h2>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="table-wrap" role="region" aria-labelledby="cmp-title" tabindex="0">
      <table>
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Indicateur</span></th>
            {#each columns as col (col.key)}
              <th scope="col" class:best={col.key === bestKey}>{col.label}{#if col.key === bestKey}<span class="badge">meilleur</span>{/if}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Solde final</th>
            {#each columns as col (col.key)}<td class="num"
                >{tokens(col.o.finalBalance)}{#if money(col.o.finalBalance)}<br /><span class="muted">{money(col.o.finalBalance)}</span>{/if}</td
              >{/each}
          </tr>
          <tr>
            <th scope="row">Gain net</th>
            {#each columns as col (col.key)}<td class="num" class:gain={col.o.netGain.gt(0)} class:loss={col.o.netGain.isNeg()}
                >{signedTokens(col.o.netGain)}{#if signedMoney(col.o.netGain)}<br /><span class="muted">{signedMoney(col.o.netGain)}</span>{/if}</td
              >{/each}
          </tr>
          <tr>
            <th scope="row">Écart avec « sans compound »</th>
            {#each columns as col (col.key)}<td class="num">{col.key === 'simple' ? '—' : signedTokens(col.o.finalBalance.minus(c.simple.finalBalance))}</td>{/each}
          </tr>
          <tr>
            <th scope="row">Rewards bruts</th>
            {#each columns as col (col.key)}<td class="num">{tokens(col.o.grossRewards)}</td>{/each}
          </tr>
          <tr>
            <th scope="row">Commission</th>
            {#each columns as col (col.key)}<td class="num">{tokens(col.o.commissionPaid)}</td>{/each}
          </tr>
          <tr>
            <th scope="row">Frais fixes</th>
            {#each columns as col (col.key)}<td class="num">{tokens(col.o.fixedFees)}</td>{/each}
          </tr>
          <tr>
            <th scope="row">Compounds effectués</th>
            {#each columns as col (col.key)}<td class="num">{col.o.compounds}</td>{/each}
          </tr>
          <tr>
            <th scope="row">APY effectif</th>
            {#each columns as col (col.key)}<td class="num">{col.o.effectiveApy ? pct(col.o.effectiveApy.times(100)) : '—'}</td>{/each}
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted fine">
      Tous frais déduits. Simulation en {asset} ; {v.price ? `montants en ${f.symbol} au cours de ${f.price(v.price)}, supposé constant` : 'aucun cours saisi, résultats en jetons seulement'}. Pas de
      compound à la toute fin : le dernier claim est compté dans les frais de sortie.
    </p>
  </section>

  <LinesChart
    title="Solde dans le temps"
    summary={balanceSummary}
    series={balanceSeries}
    xLabel="Jours"
    fmtX={fmtDays}
    fmtY={tokenAxis}
    reference={{ y: v.input.amount, label: `Montant staké (${asset})` }}
  />

  <LinesChart
    title="Solde final selon la fréquence de compound"
    summary={curveSummary}
    series={curveSeries}
    markers={curveMarkers}
    xLabel="Compounds par an"
    fmtX={(n) => String(Math.round(n))}
    fmtY={tokenAxis}
    reference={{ y: c.simple.finalBalance, label: 'Sans compound' }}
  />

  <ExportPanel {result} {sentence} {amount} />
</div>

<style>
  .results {
    display: grid;
    gap: 1rem;
    min-width: 0;
    align-content: start;
  }
  .panel.key,
  .panel.block {
    padding: 1.1rem;
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }
  h2 {
    font-size: 1.15rem;
  }
  .sentence {
    font-size: 1.02rem;
    font-weight: 550;
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.9rem 1rem;
    margin: 0;
  }
  .figures > div {
    display: grid;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }
  .figures .main {
    grid-column: 1 / -1;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--rule);
  }
  dt {
    font-size: 0.82rem;
    color: var(--muted);
    font-weight: 550;
  }
  dd {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .main dd {
    font-family: var(--font-doc);
    font-size: 2.1rem;
    line-height: 1.1;
    color: var(--accent);
  }
  .main dd.sub {
    font-family: var(--font-ui);
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 400;
    line-height: 1.4;
  }
  .gain {
    color: var(--gain);
  }
  .loss {
    color: var(--loss);
  }
  .note {
    font-size: 0.92rem;
  }
  .fine {
    font-size: 0.8rem;
  }
  th[scope='row'] {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--ink);
    white-space: normal;
  }
  thead th {
    white-space: normal;
    vertical-align: bottom;
  }
  th.best {
    color: var(--ink);
  }
  .badge {
    display: block;
    width: fit-content;
    margin-left: auto;
    margin-top: 0.2rem;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
  }
  td.num {
    white-space: nowrap;
  }
  td .muted {
    font-size: 0.82rem;
    font-weight: 400;
  }
  @media (max-width: 520px) {
    .figures {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .main dd {
      font-size: 1.7rem;
    }
    th,
    td {
      padding: 0.5rem 0.45rem;
      font-size: 0.85rem;
    }
  }
</style>
