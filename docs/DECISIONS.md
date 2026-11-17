# Journal des décisions — staking-crypto

Chaque décision est numérotée et ne se réécrit pas : on en ajoute une nouvelle qui remplace l'ancienne. Statut : ✅ actée · ⚠️ à valider · 🔁 remplacée. Dans les échanges entre projets, préfixer : « staking D-003 ».

## D-001 ✅ Nom, dépôt, licence, simulateur et non suivi
`staking-crypto`, dépôt `Patart50/staking-crypto`, AGPL-3.0 (le fichier GPL-3.0 proposé par GitHub a été remplacé). Nom choisi le 16 nov. 2026 : « staking » est le mot employé tel quel par le public français ; `rendement-crypto`, plus large (lending, farming), a été écarté pour la clarté.
L'outil est un **simulateur** : il projette un rendement à partir de paramètres saisis. Le « suivi du staking en navigateur » envisagé dans le programme (positions et rewards réellement reçus) reste hors périmètre v1.0 ; il pourra devenir une évolution de ce dépôt plutôt qu'un outil de plus.

## D-002 ✅ APR ou APY : conversion explicite, jamais APY ÷ n
L'utilisateur choisit le type du taux saisi. Le moteur travaille toujours sur un **APR nominal** :
- APR saisi : utilisé tel quel ; taux par période = APR ÷ k.
- APY saisi : converti en APR avec la convention d'une capitalisation **quotidienne**, la plus courante dans l'affichage des plateformes : APR = 365 × ((1 + APY)^(1/365) − 1). Taux par période = APR ÷ k. Conséquence voulue : compounder moins souvent que chaque jour donne un peu moins que l'APY affiché.
Diviser un APY par k comptait deux fois les intérêts composés : c'est exclu. L'APR équivalent est affiché sous le champ. Validé par Arnaud le 16 nov. 2026.

## D-003 ✅ Commission sur les rewards, gas fixe par opération
- La **commission** (validateur, plateforme) est un pourcentage prélevé sur chaque reward brut : reward net = reward brut × (1 − c). Elle ne touche pas le capital.
- Les **frais par compound** (gas d'un claim et d'un restake) sont un montant fixe déduit à chaque compound.
- Les **frais d'entrée et de sortie** sont des montants fixes payés une fois (stake au départ ; unstake et dernier claim à la fin).
- Année = 365 jours, mois = 1/12 année. Fréquences : quotidien k = 365, hebdomadaire k = 52, mensuel k = 12, personnalisé k ∈ [1, 365].
- Entre deux compounds, les rewards s'accumulent linéairement sur le capital du moment ; ceux de la dernière fraction de période sont comptés dans le solde final, sans compound.
Validé par Arnaud le 16 nov. 2026.

## D-004 ✅ Fréquence de compound optimale
Avec un frais fixe par compound, le solde final n'augmente pas avec la fréquence : il passe par un maximum, puis baisse. L'outil calcule, pour chaque k entier de 1 à 365, le solde final, retient le meilleur (k*), et le compare à la fréquence choisie et à « sans compound ». C'est la fonction qui distingue l'outil. Il affiche aussi le **point mort** : le capital sous lequel un compound coûte plus qu'il ne rapporte à la fréquence choisie. Recherche exhaustive sur k, chaque solde calculé par la **forme fermée** de la récurrence M_{i+1} = M_i(1 + q) − g, avec q = APR(1 − c)/k : M_n = (M₀ − g/q)(1 + q)^n + g/q. Une puissance par k, donc 365 calculs quelle que soit la durée (une simulation période par période coûterait plus de 3 millions de pas sur 50 ans). La simulation pas à pas reste utilisée pour l'échéancier et le graphique ; un test vérifie que les deux donnent le même solde. En cas d'égalité, la fréquence la plus faible l'emporte (moins d'opérations). Validé par Arnaud le 16 nov. 2026.

## D-005 🔁 (remplacée par D-014 et D-015) Unité du scénario : jeton ou euro, cours constant facultatif
Le calcul ne dépend pas de l'unité. L'utilisateur choisit l'unité affichée : un jeton (symbole libre, ex. « ETH ») ou l'euro. Tous les montants du scénario (montant staké, frais fixes) sont dans cette unité ; c'est à l'utilisateur de convertir un gas payé dans un autre jeton (aide sous le champ). En unité jeton, un **cours facultatif** en € permet d'afficher les équivalents en euros ; il est **constant** sur toute la durée (limite D-012). Pas d'appel à Binance en v1.0 : envisagé ensuite via `commun-crypto/binance`, en opt-in comme renfort D-013.

## D-006 ⚠️ APY effectif net, tous frais compris
APY effectif = (solde final ÷ montant staké)^(1/T) − 1, où le solde final est net de la commission, des frais de compound, d'entrée et de sortie. C'est le taux annuel réellement obtenu, comparable d'une colonne à l'autre et à l'APY affiché par la plateforme. Pour une durée de moins d'un an, il est annualisé et l'écran le précise (les frais fixes pèsent alors lourd).

## D-007 ⚠️ Scénarios enregistrés sur l'appareil
Les scénarios nommés sont gardés dans le localStorage (via `commun-crypto/storage`, préfixe `staking-crypto:`), avec repli en mémoire et avertissement si le stockage est bloqué. Le formulaire en cours est aussi gardé à chaque saisie. Comparaison de deux scénarios enregistrés côte à côte. Pas de compte, pas de synchronisation.

## D-008 ⚠️ Export CSV et partage en opt-in
CSV au format du programme (séparateur « ; », virgule décimale, BOM, comme dca D-015) : un fichier de comparaison (paramètres, puis une colonne par scénario) et un fichier d'échéancier (période, date relative, capital, reward net, frais, solde). Texte copiable. Lien de partage avec les paramètres dans le fragment `#partage?…`, jamais envoyé au serveur, proposé en opt-in, lu et retiré de la barre d'adresse comme renfort D-014.

## D-009 🔁 (remplacée par D-015) Aucun appel réseau en v1.0
Tout est saisi à la main ; aucune requête externe, à l'ouverture comme à l'usage (vérifié à chaque PR). Les seules ressources sont celles du site, mises en cache par le service worker.

## D-010 ⚠️ Arrondis
Calculs exacts en décimal (decimal.js, précision 50), jamais en `number`. Affichage : montants en jeton à 8 décimales au plus (zéros finaux retirés), montants en euros au centime, taux à 2 décimales. Aucun arrondi intermédiaire dans la simulation période par période.

## D-011 ⚠️ Aucun calcul d'impôt
L'outil ne calcule aucun impôt et ne qualifie pas fiscalement les rewards de staking. La page « À propos et limites » le dit, sans affirmer de règle fiscale, et renvoie à un professionnel ; le calcul des plus-values à la cession relève de pmpa-crypto.

## D-012 ⚠️ Limites affichées, sans enrobage
La page « À propos et limites » et une note sous les résultats rappellent que : le taux est supposé constant (il varie dans la réalité) ; le prix du jeton n'est pas modélisé (un rendement de 5 % en jetons peut être une perte en euros) ; une partie des rewards vient souvent de l'**inflation** du jeton, qui dilue les non-stakers mais n'enrichit pas d'autant les stakers (rendement réel non calculé) ; slashing, période de déblocage et risque de contrepartie (plateforme, smart contract) ne sont pas simulés.

## D-013 ⚠️ Code commun via le paquet commun-crypto
Dépendance git épinglée sur le dernier tag de `commun-crypto` (v1.2.0 au 16 nov. 2026) : `money`, `format`, `parse` (saisie des nombres de renfort D-012), `storage`, `support`, thème, `Support.svelte`, `ThemeToggle.svelte`, plugin de service worker. Aucun fichier copié depuis pmpa-crypto. Le composant de graphique (`XYChart.svelte` de renfort-crypto) est repris par copie avec son origine en tête de fichier, ou déplacé dans commun-crypto si un troisième outil en a besoin.

## D-014 ✅ Devise : dollar (USDC) par défaut, ou euro ; calcul en jetons
Demande d'Arnaud (16 nov. 2026) : on achète le plus souvent en dollars. Remplace l'unité « jeton ou euro » de D-005. Même modèle que renfort D-019 : **une devise par scénario**, `USD` (par défaut) ou `EUR` ; le dollar est l'**USDC**, assimilé au dollar.
- La simulation se fait **en jetons** : les rewards sont versés en jetons, et le rendement en jetons ne dépend pas du prix.
- Le montant staké se saisit en jetons ou dans la devise (bascule) ; les **frais fixes** (compound, entrée, sortie) se saisissent dans la devise, parce qu'un gas se pense en dollars ; la commission reste en %.
- Conversion au **cours** du jeton dans la devise, constant sur toute la durée (limite D-012) ; le cours est obligatoire dès qu'un montant est en devise ou qu'un frais fixe est non nul. Jeton USDC en dollars : cours 1.
- Résultats en jetons et dans la devise ; avec un taux EUR/USDC, équivalent dans l'autre devise.
- Changement de devise comme renfort D-019 : avec un taux, cours et frais convertis ; sans taux, l'outil demande (récupérer le taux, garder les montants, annuler). Jamais de conversion silencieuse. CSV et lien de partage portent la devise (`d=usd` / `d=eur`).

## D-015 ✅ Cours du jour et taux EUR/USDC sur Binance, en opt-in
Remplace D-009 et le « pas d'appel à Binance » de D-005. Comme renfort D-013 et D-019 : une seule requête `/api/v3/ticker/price` **sans paramètre** (liste publique de tous les cours) ; l'outil cherche le jeton dans la réponse, Binance ne voit que l'adresse IP. Consentement explicite et mémorisé avant le premier appel ; « Saisir à la main » referme l'encart sans rien envoyer ; autorisation retirable d'un clic. Aucune requête à l'ouverture de la page (vérifié à chaque PR). Chemin du cours en dollars : XUSDC ; sinon XUSDT ÷ USDCUSDT ; sinon prix en euros × EURUSDC. En euros : chemin de `priceEur` (commun D-006). Cours arrondi comme pmpa D-030, chemin affiché sous le champ, effacé si l'utilisateur modifie le cours ou le jeton. Jeton absent de Binance : l'outil le dit et demande le cours.

## D-016 ⚠️ Code de devise déplacé dans commun-crypto
`src/lib/core/currency.ts` de renfort-crypto (renfort D-019) devait rejoindre commun-crypto dès qu'un second outil aurait besoin du dollar : c'est le cas. Avant J1 : PR dans commun-crypto (`currency` et ses tests, version mineure **v1.3.0**, tag par Arnaud) ; staking-crypto épingle ce tag. renfort-crypto passera sur le paquet dans une PR séparée, sans changement de comportement.

## D-017 ⚠️ Pas de compound à la toute fin
Précise D-003 et D-004. Un compound a lieu à la fin de chaque période complète, **sauf** si elle s'achève pile à la fin de la durée : à ce moment on réclame et on retire, ce que couvrent les frais de sortie ; payer un compound de plus serait un frais sans effet. Sur 1 an à 12 compounds par an, il y a donc 11 compounds ; à 1 par an, aucun, et le résultat est exactement celui du « sans compound ». Sans frais, le modèle redonne toujours la formule d'école M(1 + APR/k)^(kT) (testé). Conséquence sur l'exemple de référence (1 ETH, APR 4 %, commission 10 %, 0,0002 ETH par compound, 1 an) : la meilleure fréquence (2 par an, un seul compound) donne 1,0361204 ETH, à peine plus que 1,036 sans compound ; le quotidien donne 0,96252783 ETH.

## D-018 ✅ Dépendance commun-crypto épinglée sur un commit, le temps du tag v1.3.0
J1 a besoin de `commun-crypto/currency` (D-016), en PR #5 de commun-crypto. En attendant le tag, `package.json` épingle le commit de la branche (`0f51ff6`) ; il passe sur `#v1.3.0` dès le tag posé, avant la fusion de J1 si possible, sinon dans la PR J2. Même contenu, aucun changement de code.
