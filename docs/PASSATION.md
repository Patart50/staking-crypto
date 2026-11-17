# staking-crypto — Passation

## État (17 nov. 2026)
J0 fusionné (PR #1 à #3). **J1 en PR** (branche `j1-squelette`) : squelette Svelte 5 + Vite + TS + Vitest, version 0.1.0 ; moteur `src/lib/core/staking.ts` testé (28 tests) ; page d'accueil d'attente avec l'exemple de référence calculé par le moteur ; page « À propos et limites » minimale avec Auteur et soutien ; CI et déploiement Pages. Décisions D-017 (pas de compound à la toute fin) à valider, D-018 (dépendance épinglée sur un commit) actée.

commun-crypto : **PR #5** (module `currency`, v1.3.0, commun D-011), à fusionner et taguer `v1.3.0` par Arnaud.

## À faire par Arnaud
1. Fusionner commun-crypto PR #5 et poser le tag `v1.3.0`.
2. Relire la PR J1 de staking-crypto ; valider D-006 à D-008, D-010 à D-013, D-016, D-017.
3. Vérifier que Pages est activé (Settings → Pages → Source « GitHub Actions »).

## Prochaine étape (Claude)
- Passer `commun-crypto` sur `#v1.3.0` dans `package.json` dès le tag (D-018).
- J2 sur la branche `j2-interface` : formulaire (devise $ par défaut, jeton, cours du jour Binance en opt-in, montant en jetons ou en devise, taux APR/APY, durée, commission, fréquence, frais en devise), conversion des frais en jetons, comparaison en trois colonnes, phrase de synthèse, graphiques (XYChart repris de renfort), scénarios enregistrés, export CSV, lien de partage.

## Points d'attention
- Exemple de référence (en jetons, D-017) : 1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound, 1 an. Sans compound : 1,036 ETH. Meilleure fréquence : 2 par an (un compound), 1,0361204 ETH. Compound quotidien : 0,96252783 ETH, perte ; point mort quotidien 2,03 ETH. L'écran doit savoir dire « ne compoundez pas » ou « à peine mieux ».
- Recherche de la fréquence optimale : 365 calculs en forme fermée ; moins d'une seconde sur 50 ans (testé).
- Vérifier à chaque PR : aucune requête externe sans consentement, aucune à l'ouverture (D-015) ; QR codes décodés identiques aux adresses de `support.ts`.
