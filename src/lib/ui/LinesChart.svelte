<!--
  Courbes x/y en SVG maison, plusieurs séries. Adapté de XYChart.svelte de
  renfort-crypto (commit 868331f, renfort D-007, D-015) : réticule et info-bulle
  au survol comme au clavier (flèches, Début, Fin), repères ponctuels.
  Valeurs converties en `number` pour l'affichage seulement.
-->
<script lang="ts">
  import type { Dec } from 'commun-crypto/money';

  export interface Series {
    name: string;
    /** Variable CSS de couleur, ex. `var(--series-1)`. */
    color: string;
    dashed?: boolean;
    points: { x: Dec; y: Dec }[];
  }
  export interface Marker {
    x: Dec;
    y: Dec;
    label: string;
    color: string;
  }

  interface Props {
    title: string;
    /** Phrase qui résume le graphique pour les lecteurs d'écran. */
    summary: string;
    series: Series[];
    markers?: Marker[];
    xLabel: string;
    fmtX: (v: number) => string;
    fmtY: (v: number) => string;
    /** Ligne horizontale de référence (ex. montant staké). */
    reference?: { y: Dec; label: string } | null;
  }
  let { title, summary, series, markers = [], xLabel, fmtX, fmtY, reference = null }: Props = $props();

  let width = $state(640);
  /** Position explorée, en valeur de x. */
  let active = $state<number | null>(null);
  const uid = $props.id();

  const height = $derived(width < 520 ? 240 : 290);
  const m = $derived({ top: 16, right: 16, bottom: 40, left: width < 420 ? 64 : 78 });
  const plotW = $derived(Math.max(10, width - m.left - m.right));
  const plotH = $derived(height - m.top - m.bottom);

  const data = $derived(series.map((s) => ({ ...s, pts: s.points.map((p) => ({ x: p.x.toNumber(), y: p.y.toNumber() })) })));

  function niceStep(range: number, count: number): number {
    const raw = range / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const norm = raw / mag;
    return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  }
  function niceScale(lo: number, hi: number, count: number) {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
    if (hi === lo) hi = lo + Math.abs(lo) * 0.01 + 1e-9;
    const step = niceStep(hi - lo, count);
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let t = min; t <= max + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
    return { min, max, ticks };
  }

  const ys = $derived.by(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of data) for (const p of s.pts) [lo, hi] = [Math.min(lo, p.y), Math.max(hi, p.y)];
    if (reference) [lo, hi] = [Math.min(lo, reference.y.toNumber()), Math.max(hi, reference.y.toNumber())];
    // Axe resserré sur les données : des soldes proches seraient écrasés par un axe depuis zéro.
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.01 || 1;
    return niceScale(lo - pad, hi + pad, 4);
  });
  const xs = $derived.by(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of data) for (const p of s.pts) [lo, hi] = [Math.min(lo, p.x), Math.max(hi, p.x)];
    if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
    const s = niceScale(lo, hi, width < 520 ? 3 : 5);
    return { min: lo, max: hi === lo ? lo + 1 : hi, ticks: s.ticks.filter((t) => t >= lo && t <= hi) };
  });

  const x = (v: number) => m.left + ((v - xs.min) / (xs.max - xs.min)) * plotW;
  const y = (v: number) => m.top + plotH - ((v - ys.min) / (ys.max - ys.min)) * plotH;
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join('');

  /** Valeur d'une série à l'abscisse v : dernier point à gauche (soldes en escalier entre deux compounds). */
  function valueAt(pts: { x: number; y: number }[], v: number): number | null {
    let found: number | null = null;
    for (const p of pts) {
      if (p.x <= v + 1e-9) found = p.y;
      else break;
    }
    return found;
  }

  function onMove(e: PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    active = xs.min + ratio * (xs.max - xs.min);
  }
  function onKey(e: KeyboardEvent) {
    const step = (xs.max - xs.min) / 50;
    const cur = active ?? xs.min;
    const keys: Record<string, number> = {
      ArrowLeft: cur - step,
      ArrowDown: cur - step,
      ArrowRight: active === null ? xs.min : cur + step,
      ArrowUp: active === null ? xs.min : cur + step,
      Home: xs.min,
      End: xs.max,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    active = Math.max(xs.min, Math.min(xs.max, keys[e.key]));
  }

  const tip = $derived.by(() => {
    if (active === null) return null;
    const left = x(active);
    const values = data.map((s) => ({ name: s.name, color: s.color, v: valueAt(s.pts, active!) })).filter((r) => r.v !== null) as { name: string; color: string; v: number }[];
    return { left, alignRight: left > m.left + plotW * 0.6, x: fmtX(active), values };
  });
  const announce = $derived(tip ? `${xLabel} ${tip.x} : ${tip.values.map((v) => `${v.name} ${fmtY(v.v)}`).join(' ; ')}` : '');
</script>

<figure class="chart panel">
  <figcaption>
    <h3 id={`${uid}-title`}>{title}</h3>
    <ul class="legend" aria-label="Légende">
      {#each data as s (s.name)}
        <li>
          <svg width="22" height="10" aria-hidden="true"
            ><line x1="1" y1="5" x2="21" y2="5" stroke={s.color} stroke-width="2.5" stroke-dasharray={s.dashed ? '5 3' : undefined} /></svg
          >
          {s.name}
        </li>
      {/each}
      {#each markers as mk (mk.label)}
        <li>
          <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill={mk.color} /></svg>
          {mk.label}
        </li>
      {/each}
      {#if reference}
        <li>
          <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="var(--series-muted)" stroke-width="1.5" stroke-dasharray="2 3" /></svg>
          {reference.label}
        </li>
      {/if}
    </ul>
  </figcaption>

  <div class="plot" bind:clientWidth={width}>
    <svg {width} {height} role="img" aria-labelledby={`${uid}-title ${uid}-sum`}>
      <desc id={`${uid}-sum`}>{summary}</desc>
      <g class="grid" aria-hidden="true">
        {#each ys.ticks as t (t)}
          <line x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} />
          <text x={m.left - 8} y={y(t)} dy="0.32em" text-anchor="end">{fmtY(t)}</text>
        {/each}
        {#each xs.ticks as t (t)}
          <text x={x(t)} y={m.top + plotH + 16} text-anchor="middle">{fmtX(t)}</text>
        {/each}
        <text class="axis-title" x={m.left + plotW / 2} y={height - 4} text-anchor="middle">{xLabel}</text>
      </g>
      <g aria-hidden="true">
        {#if reference}
          <line class="refline" x1={m.left} x2={m.left + plotW} y1={y(reference.y.toNumber())} y2={y(reference.y.toNumber())} />
        {/if}
        {#each data as s (s.name)}
          <path d={path(s.pts)} fill="none" stroke={s.color} stroke-width="2.2" stroke-dasharray={s.dashed ? '6 4' : undefined} stroke-linejoin="round" stroke-linecap="round" />
        {/each}
        {#each markers as mk (mk.label)}
          <circle cx={x(mk.x.toNumber())} cy={y(mk.y.toNumber())} r="5.5" fill={mk.color} class="dot" />
        {/each}
        {#if tip}
          <line class="crosshair" x1={tip.left} x2={tip.left} y1={m.top} y2={m.top + plotH} />
          {#each tip.values as v (v.name)}
            <circle cx={tip.left} cy={y(v.v)} r="3.5" fill={v.color} class="dot" />
          {/each}
        {/if}
      </g>
    </svg>

    <div
      class="hit"
      style:left={`${m.left}px`}
      style:top={`${m.top}px`}
      style:width={`${plotW}px`}
      style:height={`${plotH}px`}
      role="slider"
      tabindex="0"
      aria-label={`${title} : ${xLabel.toLowerCase()} exploré (flèches)`}
      aria-valuemin={Math.round(xs.min)}
      aria-valuemax={Math.round(xs.max)}
      aria-valuenow={Math.round(active ?? xs.min)}
      aria-valuetext={announce || 'Survolez ou utilisez les flèches pour lire les valeurs'}
      onpointermove={onMove}
      onpointerdown={onMove}
      onpointerleave={() => (active = null)}
      onkeydown={onKey}
      onblur={() => (active = null)}
    ></div>

    {#if tip}
      <div class="tip" class:right={tip.alignRight} style:left={`${tip.left}px`} style:top={`${m.top}px`} aria-hidden="true">
        <div>{xLabel} : <strong class="num">{tip.x}</strong></div>
        {#each tip.values as v (v.name)}
          <div><span class="swatch" style:background={v.color}></span>{v.name} : <strong class="num">{fmtY(v.v)}</strong></div>
        {/each}
      </div>
    {/if}
  </div>
</figure>

<style>
  .chart {
    margin: 0;
    padding: 1rem 1rem 0.5rem;
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  figcaption {
    display: grid;
    gap: 0.4rem;
  }
  h3 {
    font-size: 1.05rem;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .plot {
    position: relative;
    min-width: 0;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid line {
    stroke: var(--rule);
    stroke-width: 1;
  }
  .grid text {
    font-size: 11.5px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .axis-title {
    font-size: 12px;
  }
  .refline {
    stroke: var(--series-muted);
    stroke-width: 1.5;
    stroke-dasharray: 2 3;
  }
  .dot {
    stroke: var(--surface);
    stroke-width: 2;
  }
  .crosshair {
    stroke: var(--muted);
    stroke-width: 1;
  }
  .hit {
    position: absolute;
    cursor: crosshair;
    touch-action: pan-y;
    border-radius: 2px;
    z-index: 1;
  }
  .hit:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .tip {
    position: absolute;
    transform: translateX(12px);
    pointer-events: none;
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-pop);
    padding: 0.45rem 0.6rem;
    font-size: 0.82rem;
    white-space: nowrap;
    z-index: 2;
    color: var(--muted);
    display: grid;
    gap: 0.15rem;
  }
  .tip strong {
    color: var(--ink);
  }
  .tip.right {
    transform: translateX(calc(-100% - 12px));
  }
  .swatch {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 2px;
    margin-right: 0.35rem;
  }
</style>
