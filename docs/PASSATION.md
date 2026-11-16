# staking-crypto — Passation

## État (16 nov. 2026)
J0 en PR (branche `j0-spec`) : licence AGPL-3.0 (remplace la GPL-3.0 de GitHub), SPEC v0.1, décisions D-001 à D-016. Validées par Arnaud : D-001 à D-004, D-014 (dollar USDC par défaut, ou euro) et D-015 (cours Binance en opt-in) ; D-005 et D-009 remplacées ; D-006 à D-008, D-010 à D-013 et D-016 à valider en relisant la PR. Aucun code.

## À faire par Arnaud
1. Relire et fusionner la PR J0 ; dire ce qui change dans les décisions ⚠️.
2. Vérifier que Pages est activé (Settings → Pages → Source « GitHub Actions »).

## Prochaine étape (Claude)
Avant J1 : PR commun-crypto `currency` (déplacé de renfort, D-016) ; Arnaud tague `v1.3.0`. Il faut l'accès de cette conversation à commun-crypto.

J1 sur la branche `j1-squelette` : squelette Svelte 5 + Vite + TS + Vitest ; commun-crypto au dernier tag ; moteur `src/lib/core/staking.ts` testé (conversion APY, sans compound, compound pas à pas et forme fermée concordants, formule d'école retrouvée sans frais, fréquence optimale, point mort, cas limites) ; thème, service worker, pied de page, À propos minimal avec Auteur et soutien ; README ; CHANGELOG ; CI et déploiement Pages.

## Points d'attention
- Exemple de référence pour les tests (vérifié en J0, en jetons) : 1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound, 1 an. Sans compound : 1,036 ETH. Meilleure fréquence : 2 par an, 1,0359204 ETH, donc **moins bien que ne rien faire**. Compound quotidien : 0,9623 ETH, perte. L'écran doit savoir dire « ne compoundez pas ».
- Vérifier à chaque PR : aucune requête externe sans consentement, aucune à l'ouverture (D-015).
