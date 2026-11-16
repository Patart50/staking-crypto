# staking-crypto — Passation

## État (16 nov. 2026)
J0 en PR (branche `j0-spec`) : licence AGPL-3.0 (remplace la GPL-3.0 de GitHub), SPEC v0.1, décisions D-001 à D-013. D-001 à D-004 validées par Arnaud ; D-005 à D-013 à valider en relisant la PR. Aucun code.

## À faire par Arnaud
1. Relire et fusionner la PR J0 ; dire ce qui change dans D-005 à D-013.
2. Vérifier que Pages est activé (Settings → Pages → Source « GitHub Actions »).

## Prochaine étape (Claude)
J1 sur la branche `j1-squelette` : squelette Svelte 5 + Vite + TS + Vitest ; commun-crypto au dernier tag ; moteur `src/lib/core/staking.ts` testé (conversion APY, sans compound, compound pas à pas et forme fermée concordants, formule d'école retrouvée sans frais, fréquence optimale, point mort, cas limites) ; thème, service worker, pied de page, À propos minimal avec Auteur et soutien ; README ; CHANGELOG ; CI et déploiement Pages.

## Points d'attention
- Exemple de référence pour les tests (vérifié en J0) : 1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound, 1 an. Sans compound : 1,036 ETH. Meilleure fréquence : 2 par an, 1,0359204 ETH, donc **moins bien que ne rien faire**. Compound quotidien : 0,9623 ETH, perte. L'écran doit savoir dire « ne compoundez pas ».
- Vérifier à chaque PR : aucune requête externe (D-009).
