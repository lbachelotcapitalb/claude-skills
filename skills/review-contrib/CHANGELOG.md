# Changelog — review-contrib

Le numéro qui fait foi est dans le fichier [`VERSION`](VERSION), à côté de ce fichier.

Ce que veut dire un incrément, **pour un skill** (ce n'est pas une API : ce qui casse, c'est
la manœuvre dans la tête de celui qui l'exécute) :

| Rang | Ce qui change | Ce que ça vous demande |
|---|---|---|
| **MAJEUR** | la manœuvre change, ou une consigne qui était juste devient fausse | relire le skill avant de rejouer une revue |
| **MINEUR** | nouvelle étape, nouveau garde-fou, nouveau fichier de référence | à lire quand vous en croisez le cas |
| **CORRECTIF** | précision, reformulation, lien mort, coquille | rien |

## Sommaire

- **1.3.0** — §5 sur deux axes (conformité + demande), gate de vérification des défauts, chasse aux variantes
- **1.2.1** — la page jointe s'articule autour de deux tableaux
- **1.2.0** — mail court / page complète, budgets de lecture
- **1.1.0** — le digest décisionnel pour un mainteneur non développeur
- **1.0.0** — première version publiée

---

## 1.3.0 — 2026-08-13

Le §5 était le maillon faible du skill : une consigne d'une page pour l'étape qui produit tout
ce qui part chez le contributeur. Trois renforts, repris de skills publics d'éditeurs identifiés
(Trail of Bits `differential-review` / `fp-check` / `variant-analysis`, mattpocock `code-review`)
et transposés à la revue de contribution externe.

- **§5 — l'audit se joue sur DEUX axes, en parallèle et sans fusion** : *conformité* (le code
  est-il correct, sûr, conforme au dépôt) et *demande* (fait-il ce qui avait été demandé, ni
  moins ni plus). Le second manquait complètement : un code impeccable qui implémente autre chose
  passait la revue, et la dérive de périmètre n'avait aucun endroit où atterrir. Fusionner les
  deux axes reclasse, donc ils se restituent côte à côte. Quatrième erreur de cadrage ajoutée au
  préambule.
- **Nouvelle référence [audit-code.md](references/audit-code.md)** : triage par **risque** et non
  par taille du diff (une validation retirée en une ligne est un risque élevé), rayon d'impact
  **compté** et non estimé, couverture de test mesurée sur le diff seul, prompts des deux
  sous-agents, et les six rationalisations qui font sauter une étape.
- **Nouvelle référence [verification-defauts.md](references/verification-defauts.md) — la gate
  qui manquait.** Ce que rend un sous-agent est une liste de **suspects**, jamais de défauts : un
  modèle qui cherche des bugs en trouve, et surévalue la gravité. Avant qu'un défaut parte —
  reformulation en quatre champs (la moitié s'effondre là), remontée du flux jusqu'à l'entrée,
  passe d'**avocat du diable** qui cherche à réfuter, verdict `confirmé` / `réfuté` /
  `non tranché` avec effet écrit sur les documents sortants. Un `non tranché` part en **question**,
  jamais en reproche ; aucun `BLOQUANT` ne sort sans son chemin de déclenchement.
- **Chasse aux variantes** (même fichier) : une cause racine a presque toujours essaimé ailleurs.
  Montée par paliers depuis la correspondance exacte, un élément généralisé à la fois. Les
  occurrences entrent comme **un seul défaut à plusieurs emplacements** — le contributeur corrige
  une cause, pas une liste — et une cause mécanique appelle en plus une règle de non-régression.
- **§5 — `/code-review` est le MOTEUR de l'axe conformité**, pas un second avis. Sur la détection
  pure il bat un sous-agent écrit à la main ; le prompt d'`audit-code.md` devient le repli. Ce
  qu'il ignore est listé : le périmètre de §1bis (sur `<PR#>` il audite aussi les commits du
  mainteneur), le cadrage d'origine (l'axe *demande* reste entier), et la boucle §9 (pas
  d'identifiant stable). **Ni `--comment` ni `--fix` sur la branche d'un contributeur** :
  `--comment` publie sous ton nom, en inline, des trouvailles qui n'ont pas passé la gate — c'est
  précisément ce que la gate empêche.
- **Le registre de vérification est une colonne de plus dans celui de §9.2**, pas un second
  fichier. Les `réfuté` y restent : c'est ce qui permet de répondre « on l'a regardé, voilà
  pourquoi ce n'en est pas un » et de voir quel type de faux suspect notre audit produit.

Même logique que §5ter, autre objet : là-bas on refusait d'envoyer une **règle extérieure** non
sourcée, ici on refuse d'envoyer un **défaut** non vérifié. Le coût est asymétrique dans les deux
cas — vérifier prend des minutes, se tromper coûte un tour de boucle et du crédit.

## 1.2.1 — 2026-08-12

- **§10.5 — la page jointe a une colonne vertébrale : deux tableaux.** « ✓ Ce qu'on garde »
  puis « ⚠ Ce qu'il faut revoir » (bloquants en tête : gravité · où · le problème · le remède),
  ensuite les captures et les arbitrages. Le contexte, le glossaire et les angles morts sont
  **repliés** : disponibles, hors du chemin de lecture. Un lecteur qui décide balaie deux
  tableaux, il ne lit pas des paragraphes.

## 1.2.0 — 2026-08-12

Le digest de la 1.1.0 mettait tout dans le mail. Trop long : un mainteneur qui n'a pas le
contexte du dépôt ne lit pas un tableau de douze lignes sur son téléphone.

- **§10.2bis — le mail est court, la page est complète.** Deux objets, deux rôles : le mail ne
  porte que `synthese` + verdict + recommandation + effort (30 secondes, sans contexte) ; le
  détail, les captures et les arbitrages vivent dans une **page jointe autonome à onglets**, un
  par contribution. Le mail n'est pas un résumé de la page, c'est **ce qu'on retient si on ne
  l'ouvre jamais** — un mail qui recopie la page se fait survoler deux fois.
- **`synthese` : nouveau champ obligatoire**, 2 à 4 puces de 110 caractères. Chaque puce se
  suffit à elle-même : ni renvoi, ni préambule, ni mot technique non défini.
- **Des budgets de lecture sur tous les champs** (titre 70, symptôme 200, conséquence 150…).
  Ce ne sont pas des suggestions : une phrase qui déborde se **coupe**, elle ne se reformule
  pas. Le raisonnement a déjà son domicile, `audit.md`.

## 1.1.0 — 2026-08-12

Le skill savait restituer au mainteneur *développeur* (§6, page HTML) et au contributeur (§9,
rapport de correction). Il lui manquait le lecteur qui **décide sans lire le code**.

- **§6bis + `references/restitution-pedago.md` — le digest décisionnel.** Qui lit, ce qu'il
  attend, les six règles d'écriture (aucun terme technique sans définition ; un symptôme se
  chiffre ; une conséquence se dit en métier ; une recommandation est un ordre exécutable ; ce
  qui n'a pas été vérifié se dit ; ce qui est bon se dit aussi), la doctrine de capture sans
  personne devant l'écran (avant/après, cadrage sur l'élément, jamais d'image inventée), et les
  trois travers d'un digest qui rassure — dont le verdict `non_conclu`, qui remplace le « vert
  par défaut » quand l'audit n'a pas pu mesurer l'essentiel.
- **`references/restitution.schema.json` — le contrat.** La session d'audit écrit la MATIÈRE
  (`restitution.json` + `captures/`), un script écrit la FORME. Un digest rédigé librement par
  un modèle dérive d'un tour à l'autre : la mise en page bouge, une section disparaît, une
  couleur ne veut plus rien dire.

## 1.0.0 — 2026-08-11

Première version **numérotée**. Le skill existait déjà ; ce qui est neuf, c'est de pouvoir
savoir qu'on en tient une copie périmée.

- **Numérotation + contrôle de version.** `VERSION`, ce changelog, et
  `scripts/check-update.sh` : au chargement, le skill compare sa version locale à celle
  publiée et signale une mise à jour. Une requête, 3 s max, silencieux hors ligne.
- **§9.5 — « une langue que le destinataire comprend ».** La boucle de correction avait
  trois exigences ; elle en a quatre. Un rapport exact que le contributeur ne comprend pas
  produit le même résultat qu'un rapport faux : il ne corrige rien, et il ne le dit pas.
  Trois réflexes (aucun identifiant nu, aucun renvoi qu'il ne peut pas résoudre seul, le
  défaut raconté par ce qu'on voit à l'écran) et le contrôle honnête — faire résumer le
  rapport par quelqu'un qui n'a pas suivi la session, plutôt que se relire soi-même.
