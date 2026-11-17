# staking-crypto — Passation

## État (17 nov. 2026)
J0 et J1 fusionnés. **J2 en PR** (branche `j2-interface`, v0.2.0) : calculateur complet. Formulaire (dollar par défaut, cours et taux du jour Binance en opt-in, montant en jetons ou en devise, APR/APY, durée, commission, fréquence, frais en devise), synthèse, comparaison en trois colonnes, deux graphiques, scénarios enregistrés, CSV de la comparaison et de l'échéancier, résumé copiable, lien de partage. 49 tests. D-019 à valider, D-020 actée.

commun-crypto PR #5 fusionnée ; **tag `v1.3.0` à poser par Arnaud** (staking épingle en attendant le commit de fusion `938d1cb`, D-020).

## À faire par Arnaud
1. Poser le tag `v1.3.0` sur commun-crypto (release « v1.3.0 — Euro ou dollar (USDC) »).
2. Relire et fusionner la PR J2 ; valider D-019 et les décisions ⚠️ restantes (D-006 à D-008, D-010 à D-013, D-016, D-017).

## Prochaine étape (Claude)
- Passer `commun-crypto` sur `#v1.3.0` dès le tag.
- J3 (v1.0.0) sur la branche `j3-v1` : page « À propos et limites » complète (formules, exemple chiffré, inflation, limites), hors ligne vérifié, accessibilité sur tous les états, README avec captures, release `v1.0.0` par Arnaud.
- renfort-crypto : passer sur `commun-crypto/currency` (PR séparée, sans changement de comportement).

## Points d'attention
- Exemple de référence (D-017) : 1 ETH, APR 4 %, commission 10 %, 0,50 $ par compound à 2 500 $ (0,0002 ETH), 1 an. Sans compound 1,036 ETH ; quotidien 0,96252783 ETH (−183,68 $ par rapport à ne rien faire) ; meilleure fréquence 2 par an, 1,0361204 ETH (+0,30 $, gain marginal) ; point mort quotidien 2,03 ETH.
- Vérifié dans Chromium à chaque PR : axe-core sur l'accueil vide, les résultats, les scénarios, À propos et la fenêtre de soutien (1 280 px clair, 375 px sombre) ; aucune requête externe sans consentement ; Binance simulé (cours ETHUSDC, taux EURUSDC, conversion en euros) ; lien de partage aller-retour ; QR codes décodés.
