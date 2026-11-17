<script lang="ts">
  /**
   * Page « À propos et limites » : ce que fait l'outil, ce qu'il envoie, sa méthode et ses limites (D-012).
   * Structure reprise de renfort-crypto (commit 868331f, About.svelte). Version minimale (J1), complétée en J3.
   */
  import { AUTHOR, SPONSORS_URL } from 'commun-crypto/support';
  import Support from 'commun-crypto/ui/Support.svelte';
  import { SUPPORT_INTRO } from './supportIntro';

  const version = __APP_VERSION__;
  const repo = 'https://github.com/Patart50/staking-crypto';
</script>

<article class="about" aria-labelledby="about-title">
  <header>
    <h1 id="about-title" tabindex="-1">À propos et limites</h1>
    <p class="muted">staking-crypto {version} · logiciel libre (AGPL-3.0)</p>
  </header>

  <section>
    <h2>Ce que fera l'outil</h2>
    <p>
      Comparer le rendement d'un staking <strong>sans</strong> et <strong>avec</strong> intérêts composés, commission du validateur et frais fixes (gas, entrée,
      sortie) compris, et trouver la fréquence de compound qui rapporte le plus. Avec un frais fixe par compound, compounder plus souvent n'est pas toujours
      mieux : au-delà d'un certain rythme, les frais mangent le gain.
    </p>
  </section>

  <section>
    <h2>Vos données</h2>
    <p>
      Tout est calculé dans ce navigateur. Pas de compte, pas de serveur, pas de mesure d'audience. Seule exception prévue, avec votre accord : le cours du jour
      d'un jeton, lu dans la liste publique des cours de Binance, sans que le jeton choisi lui soit transmis.
    </p>
  </section>

  <section>
    <h2>Méthode</h2>
    <ul>
      <li>La simulation se fait en jetons : les rewards sont versés en jetons. Un APY saisi est converti en APR (capitalisation quotidienne), jamais divisé.</li>
      <li>La commission est prélevée sur chaque reward ; les frais de compound sont un montant fixe par opération.</li>
      <li>
        Chaque choix est publié dans le <a href={`${repo}/blob/main/docs/DECISIONS.md`} target="_blank" rel="noopener">journal des décisions</a>, les formules
        dans la <a href={`${repo}/blob/main/docs/SPEC.md`} target="_blank" rel="noopener">spécification</a>.
      </li>
    </ul>
  </section>

  <section>
    <h2>Limites connues</h2>
    <ul>
      <li><strong>Taux constant</strong> : dans la réalité, il varie.</li>
      <li><strong>Prix du jeton non modélisé</strong> : un rendement de 5 % en jetons peut être une perte en dollars ou en euros.</li>
      <li>
        <strong>Inflation</strong> : une partie des rewards vient souvent de la création de nouveaux jetons ; elle dilue ceux qui ne stakent pas, mais ne vous
        enrichit pas d'autant. Le rendement réel n'est pas calculé.
      </li>
      <li><strong>Non simulés</strong> : slashing, période de déblocage, risque de la plateforme ou du smart contract, impôt.</li>
    </ul>
  </section>

  <section>
    <h2>Avertissement</h2>
    <p>
      Outil d'aide au calcul, à but d'information. Ce n'est ni un conseil en investissement ni une recommandation. Les cryptos sont des actifs très volatils :
      n'investissez que ce que vous pouvez vous permettre de perdre.
    </p>
  </section>

  <section>
    <h2>Contribuer</h2>
    <p>
      Une erreur de calcul, une idée, une question : <a href={`${repo}/issues`} target="_blank" rel="noopener">ouvrez une discussion sur GitHub</a>. Le code
      source est libre (<a href={`${repo}/blob/main/LICENSE`} target="_blank" rel="noopener">AGPL-3.0</a>).
    </p>
  </section>

  <section>
    <h2>Auteur et soutien</h2>
    <p>
      Créé et maintenu par <a href={AUTHOR.url} target="_blank" rel="noopener author">{AUTHOR.name} ({AUTHOR.handle})</a>, sur son temps libre. L'outil est
      gratuit et le restera. Pour le soutenir : <a href={SPONSORS_URL} target="_blank" rel="noopener">GitHub Sponsors</a>, ou en crypto, <Support intro={SUPPORT_INTRO} />.
    </p>
  </section>

  <p><a href="#accueil">← Retour à l'accueil</a></p>
</article>

<style>
  .about {
    display: grid;
    gap: 1.4rem;
    max-width: 46rem;
  }
  header {
    display: grid;
    gap: 0.3rem;
  }
  h1 {
    font-size: clamp(1.6rem, 3.5vw, 2.1rem);
  }
  h1:focus {
    outline: none;
  }
  h2 {
    font-size: 1.2rem;
    margin-bottom: 0.4rem;
  }
  ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.45rem;
  }
</style>
