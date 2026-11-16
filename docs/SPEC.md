# Spécification — staking-crypto v0.1

Calculateur de rendement de staking, 100 % local, en français. Il compare le rendement **sans** et **avec** intérêts composés, **frais compris**, pour n'importe quel pool ou protocole. Projet du programme d'outils open source crypto d'Arnaud (Patart50), frère de [pmpa-crypto](https://github.com/Patart50/pmpa-crypto), [dca-crypto](https://github.com/Patart50/dca-crypto) et [renfort-crypto](https://github.com/Patart50/renfort-crypto). Toute convention de calcul est consignée dans [DECISIONS.md](DECISIONS.md).

## 1. Objectif

Répondre à trois questions :
- « Combien vais-je gagner en stakant X pendant N mois à tel taux, frais déduits ? »
- « Est-ce que réinvestir mes rewards (compound) vaut le coup, vu les frais de transaction ? »
- « À quelle fréquence faut-il compounder pour gagner le plus ? » (D-004)

Ce qui le distingue des calculateurs existants : en français, sans aucun envoi de données, comparaison côte à côte, et **frais fixes pris en compte**, ce qui fait apparaître une fréquence de compound optimale au lieu du « plus souvent = mieux » des formules d'école.

L'outil **ne calcule aucun impôt** et ne prédit aucun prix (D-011, D-012).

## 2. Données d'entrée

| Champ | Détail |
|---|---|
| Devise | Dollar (USDC, **par défaut**) ou euro, pour tous les montants en monnaie du scénario (D-014) |
| Jeton | Symbole libre (ex. « ETH ») ; sert aussi à chercher le cours sur Binance |
| Montant staké | > 0, saisi en jetons ou dans la devise (bascule), converti au cours (D-014) |
| Taux | > 0, en %, avec le type **APR** ou **APY** (D-002) |
| Durée | > 0, en jours, mois ou années ; 50 ans au plus |
| Fréquence de compound | Aucun, quotidien, hebdomadaire, mensuel (D-003) ; option « personnalisée » (nombre de compounds par an) |
| Commission | En %, dans [0, 100[, prélevée sur les rewards (D-003) ; 0 si le taux affiché est déjà net |
| Frais par compound | Montant fixe ≥ 0, dans la devise (gas d'un claim + restake), converti en jetons au cours (D-003, D-004, D-014) |
| Frais d'entrée et de sortie | Montants fixes ≥ 0, dans la devise, payés une fois (stake, unstake et dernier claim) |
| Cours | Prix d'un jeton dans la devise, constant sur la durée : saisi, ou « Cours du jour » sur Binance en opt-in (D-015). Obligatoire dès qu'un montant est en devise ou qu'un frais fixe est non nul |
| Taux EUR/USDC | Facultatif : saisi, ou paire EURUSDC sur Binance en opt-in ; sert au changement de devise (D-014) |

## 3. Calcul

Code prévu : `src/lib/core/staking.ts`, logique pure, testée par Vitest. Calcul en décimal exact (decimal.js), jamais en `number` (D-010).

La simulation se fait **en jetons** (les rewards sont versés en jetons) ; les frais fixes saisis en devise sont convertis en jetons au cours, et les résultats sont affichés en jetons et dans la devise, au même cours constant (D-014). Notations : M montant staké (jetons), APR taux annuel nominal brut, c commission, k compounds par an, T durée en années, g, e, s frais par compound, d'entrée et de sortie, en jetons (frais en devise ÷ cours). Année = 365 jours, mois = 1/12 année (D-003).

| Résultat | Formule |
|---|---|
| APR à partir d'un APY saisi (D-002) | APR = 365 × ((1 + APY)^(1/365) − 1) |
| APR net | APR × (1 − c) |
| Capital de départ | M₀ = M − e |
| **Sans compound** | rewards = M₀ × APR × (1 − c) × T ; solde final = M₀ + rewards − s |
| **Avec compound**, par période de 1/k an | r = M_i × APR × (1 − c) / k ; M_{i+1} = M_i + r − g |
| Dernière période incomplète | rewards au prorata du temps restant, non réinvestis |
| Solde final avec compound | M_n + rewards de la dernière fraction − s |
| Rewards nets | solde final − M (tous frais déduits) |
| Frais totaux | e + s + nombre de compounds × g ; plus la commission prélevée |
| APY effectif (D-006) | (solde final ÷ M)^(1/T) − 1 |
| Forme fermée (D-004) | q = APR(1 − c)/k ; M_n = (M₀ − g/q)(1 + q)^n + g/q |
| Fréquence optimale (D-004) | k* ∈ {1, …, 365} qui maximise le solde final (forme fermée) ; comparé à « sans compound » |
| Point mort du compound (D-004) | capital sous lequel un compound coûte plus qu'il ne rapporte : M_i × APR × (1 − c) / k ≤ g |

Sans frais fixes (g = 0), le compound retrouve la formule d'école M × (1 + APR(1 − c)/k)^(k·T) (vérifié par test).

Cas limites, chacun signalé par un statut, jamais par une erreur silencieuse :
- **Compound déficitaire** : à la fréquence choisie, un compound rapporte moins que ses frais ; le solde diminue à chaque opération. Message et fréquence optimale mise en avant.
- **Frais supérieurs aux rewards** : rendement net négatif, même sans compound. Message.
- **Frais d'entrée ≥ montant** : calcul impossible, erreur sous le champ.
- **Durée inférieure à une période** : aucun compound n'a lieu ; les deux scénarios sont identiques, ce que l'écran dit.
- Entrées invalides (montant, taux ou durée ≤ 0, commission hors de [0, 100 %[, frais négatifs) : `RangeError`, interceptée par la validation du formulaire.

## 4. Interface

Une page, deux colonnes sur grand écran (formulaire à gauche, résultats à droite), une seule en dessous de 900 px. Calcul en direct à chaque saisie, comme renfort D-012.

- **Votre staking** : devise ($ par défaut / €, groupe radio ; conversion ou choix explicite sans taux, comme renfort D-019), taux EUR/USDC avec « Taux du jour », jeton, cours avec « Cours du jour » (Binance, consentement D-015), montant en jetons ou en devise, taux et type APR/APY (groupe radio), durée et unité, commission, fréquence de compound, frais en devise (par compound, entrée, sortie).
- **Résultat** : tableau côte à côte « Sans compound » / « Avec compound (fréquence choisie) » / « Fréquence optimale » (colonne masquée si elle coïncide avec la fréquence choisie) ; lignes : rewards nets, solde final, frais totaux, commission prélevée, nombre de compounds, APY effectif ; écart entre les colonnes en clair. Montants en jetons et dans la devise ; avec un taux EUR/USDC, équivalent dans l'autre devise sous le chiffre principal.
- **Phrase de synthèse** annoncée aux lecteurs d'écran (`aria-live`) : par exemple « Compounder chaque semaine rapporte 0,12 ETH de plus que ne rien faire ; au-delà d'un compound tous les 9 jours, les frais mangent le gain. »
- **Graphique** : solde dans le temps, une courbe par colonne (SVG maison, lecture au clavier, comme renfort D-007) ; second graphique facultatif : solde final selon le nombre de compounds par an, avec l'optimum marqué (D-004).
- **Scénarios** (D-007) : enregistrer sous un nom, liste, recharger, renommer, supprimer, comparer deux scénarios enregistrés.
- **Garder ou partager** (D-008) : CSV de la comparaison, CSV de l'échéancier période par période, texte copiable, lien de partage en opt-in.
- **À propos et limites** (`#a-propos`) : ce que fait l'outil, vos données, méthode et formules, limites (D-012), avertissement, contribuer, auteur et soutien.
- En-tête, thème auto / clair / sombre, pied de page « Créé par Arnaud (Patart50) · Soutenir le projet ».

Principes communs : 100 % dans le navigateur, aucune requête externe sans consentement (D-015), hors ligne (service worker), 375 px sans débordement, WCAG 2 AA vérifié avec axe-core.

## 5. Cours et devise

- **Binance** (`commun-crypto/binance`, D-015) : `loadTicker` (liste publique de tous les cours, deux hôtes), sans paramètre : la crypto n'est pas envoyée.
- **Devise** (`commun-crypto/currency`, D-016, repris de renfort D-019) : `formatter` ($ / €), `convert`, `eurUsdcRate` (EURUSDC), `priceUsdc` (XUSDC ; sinon XUSDT ÷ USDCUSDT ; sinon prix en euros × EURUSDC), `priceEur` (paire EUR, puis USDT, USDC, BTC). Chemin de conversion affiché sous le champ.
- Jeton **USDC** en dollars : cours fixé à 1, sans appel.

## 6. Jalons

- **J0** Spec v0.1, décisions, licence AGPL-3.0 (cette PR).
- **J1** Squelette Svelte 5 + Vite + TS + Vitest, commun-crypto au tag qui contient `currency` (D-016), moteur de calcul testé (formules, cas limites, fréquence optimale, concordance avec la formule d'école), CI et déploiement Pages (page d'attente), À propos minimal avec auteur et soutien.
- **J2** Interface complète : saisie, comparaison, graphiques, scénarios enregistrés, export CSV, partage.
- **J3** v1.0 : page « À propos et limites » complète, hors ligne vérifié, accessibilité (axe-core), release.

## 7. Hors périmètre v1.0

Calcul d'impôt ; prix futur du jeton et inflation de l'offre (rendement réel) ; taux variable dans le temps ; slashing ; période de déblocage (unbonding) ; liquid staking et ses décotes ; ajout ou retrait en cours de route ; suivi de positions réelles (D-001) ; connexion à une plateforme ou à un wallet.
