# §10 — Restituer AU MAINTENEUR NON DÉVELOPPEUR (le digest décisionnel)

## Sommaire

- 10.1 Qui lit, et ce qu'il attend
- 10.2 Le contrat : `restitution.json`, écrit par la session d'audit
- 10.3 Les six règles d'écriture
- 10.4 Les captures : ce qui se montre, et ce qui ne s'invente pas
- 10.5 Ce que le rendu fait de ce fichier
- 10.6 Le piège : un digest qui rassure

§6 produit une page HTML pour **montrer la contribution**. §9 produit un rapport pour **le
contributeur**. Il manque le troisième destinataire, et c'est celui qui décide : **le mainteneur
qui ne lit pas le code**. Il ne veut pas un audit, il veut *trancher* — et pour trancher il lui
faut comprendre, en français, ce que la contribution change, ce qui cloche, et ce que ça coûte.

### 10.1 Qui lit, et ce qu'il attend

Le mainteneur n'est pas développeur. Il connaît son métier (patrimoine, fiscalité, compta) mieux que
quiconque, et il lit en diagonale sur un écran chargé. Ce qu'il attend d'un digest, dans l'ordre :

| Il veut savoir | Ce qu'on lui donne |
|---|---|
| **Est-ce que je peux merger ?** | un verdict en tête, une couleur, trois mots |
| **Qu'est-ce que ça apporte ?** | une phrase sur ce que l'utilisateur de l'app gagne |
| **Qu'est-ce qui cloche ?** | un tableau : où · ce qu'on voit · ce que ça coûte · le remède |
| **À quoi ça ressemble ?** | des captures de SON app qui tourne, légendées |
| **Qu'est-ce que je dois faire ?** | une recommandation nette, avec l'effort et le « qui » |
| **Sur quoi dois-je trancher ?** | les questions qu'aucun audit ne peut trancher à sa place |

Ce qu'il ne veut pas : le nom des fonctions, les numéros de ligne en tête d'argument, le
vocabulaire de la revue de code (`rebase`, `cherry-pick`, `patch-id`, `worktree`). Ces mots-là ont
leur place dans `audit.md`, pas dans le digest.

### 10.2 Le contrat : `restitution.json`, écrit par la session d'audit

Le digest n'est **pas** rédigé en HTML par l'agent : il est **rendu** par un script à partir d'un
fichier structuré. La raison est la même que pour `INDEX.md` (§ veille) : un rendu écrit à la main
par un modèle dérive d'un tour à l'autre — la mise en page change, une section disparaît, une
couleur ne veut plus rien dire. Le modèle écrit la MATIÈRE, le script écrit la FORME.

La session d'audit dépose donc, à côté de `audit.md` :

```
restitution.json      ← la matière du digest (schéma : restitution.schema.json)
captures/*.png        ← les écrans, si la contribution touche l'interface
```

Le schéma exact, commenté, vit dans
**[references/restitution.schema.json](restitution.schema.json)**. En résumé :

| Champ | Ce qu'on y met | Piège |
|---|---|---|
| `titre_clair` | ce que fait la PR, en français, sans le préfixe du contributeur | ne pas recopier le sujet du commit |
| `en_une_phrase` | l'intention, du point de vue de l'utilisateur de l'app | pas « refactor du moteur » |
| `pourquoi_ca_compte` | ce que ça change pour un client / un dossier | si ça ne change rien pour l'utilisateur, le DIRE |
| `recommandation` | `action`, `en_clair`, `effort`, `qui` | l'action est un verbe, pas un constat |
| `defauts[]` | `ou_en_clair`, `symptome` (chiffré), `consequence`, `correction` | `symptome` = ce qu'on VOIT, pas ce qu'on lit dans le code |
| `apports[]` | ce qu'il faut garder, même si le verdict est « ne pas merger » | un audit qui n'a que des reproches se fait ignorer |
| `captures[]` | `fichier`, `legende`, `ce_qu_il_faut_regarder` | jamais de capture sans légende |
| `a_trancher[]` | `question`, `options[]`, `mon_avis` | c'est SA décision : on éclaire, on ne tranche pas |
| `jargon[]` | chaque terme technique employé, avec sa définition | si le mot n'est pas défini, il ne doit pas apparaître |
| `non_verifie[]` | ce qu'on n'a pas pu mesurer, et pourquoi | un silence se lit comme un « tout va bien » |

### 10.2bis Le mail est court, la page est complète

Deux objets, deux rôles — ne jamais mettre le second dans le premier :

| | Le **mail** | La **page jointe** |
|---|---|---|
| Contient | les 2 à 4 puces de `synthese`, le verdict, la recommandation, l'effort | tout le reste : défauts, captures, apports, arbitrages, glossaire, angles morts |
| Se lit en | 30 secondes, sur un téléphone, sans contexte | 5 minutes, assis, quand la décision se prend |
| Forme | texte, aucune image, aucun tableau | page autonome à **onglets**, un par contribution |

Le mail n'est pas un résumé de la page : c'est **ce qu'on retient si on ne l'ouvre jamais**. Un
mail qui recopie la page force à lire deux fois la même chose et se fait survoler les deux fois.

**Les longueurs du schéma sont des budgets, pas des suggestions.** Le lecteur n'a pas le contexte
du dépôt : il ne saura pas quoi faire d'un paragraphe, et une nuance de plus ne l'aidera pas à
décider. Une phrase qui déborde se **coupe** — on ne rallonge jamais un champ pour « être
complet », c'est à ça que sert `audit.md`.

### 10.3 Les six règles d'écriture

1. **Aucun terme technique sans définition.** Soit on l'évite, soit il part dans `jargon[]` et le
   rendu l'affiche. « PASS », « TMI », « rebase », « régression » : chacun a un coût de lecture.
2. **Un symptôme se chiffre.** « Le calcul est faux » ne permet pas de décider. « L'écran affiche
   65 000 € d'abattement au lieu de 100 000 € pour un enfant » permet de décider tout de suite.
3. **Une conséquence se dit en métier, pas en code.** Pas « la fonction renvoie NaN » mais « le
   tableau de synthèse du client reste vide, sans message d'erreur ».
4. **Une recommandation est un ordre exécutable.** « Ne pas merger, demander à Antoine de corriger
   B1 et I2, ~1 h de son côté » — pas « il serait souhaitable d'envisager ».
5. **Ce qu'on n'a pas vérifié se dit.** Une revue automatique a des angles morts (pas d'API, pas de
   banc, règle sans source) : ils vont dans `non_verifie[]`, jamais dans le silence.
6. **Ce qui est bon se dit aussi.** `apports[]` n'est pas de la politesse : c'est ce qui reste à
   sauver quand le verdict est « ne pas merger ».

### 10.4 Les captures : ce qui se montre, et ce qui ne s'invente pas

Une capture vaut dix lignes de description — **à condition qu'elle vienne de son app en train de
tourner**. Le banc est celui de §6 (worktree en detached, `.env` mort, dossier fictif) ; ici on
capture en plus **sans personne devant l'écran**, donc :

- **On ne capture QUE si la PR touche l'interface.** Un moteur de calcul pur ne produit pas
  d'écran : `captures: []`, et on dit pourquoi dans `non_verifie[]`.
- **Un avant/après vaut mieux qu'un après.** Deux captures du même écran, base puis branche, avec
  la même donnée fictive — c'est ce qui rend une régression visible sans lire une ligne de code.
- **Chaque capture porte une légende ET un « ce qu'il faut regarder »** : le mainteneur ne cherchera pas
  l'écart tout seul dans une capture de 1 400 px.
- **Cadrer sur l'élément**, pas sur la page entière : viewport 1280×800, `clip` sur le bloc
  concerné quand il est identifiable. Une capture pleine page où l'écart fait 12 px est illisible.
- **Jamais de capture inventée, jamais de maquette.** Si le banc ne démarre pas (dépendances,
  mémoire, build cassé), on le dit dans `non_verifie[]`. Une image fabriquée pour « illustrer »
  est un mensonge sur un travail qu'on juge.
- **Poids** : PNG, 4 captures par PR au maximum. Au-delà, on choisit — le digest se lit sur un
  téléphone.

### 10.5 Ce que le rendu fait de ce fichier

Côté veille (`<dépôt-de-config>/scripts/veille-pr/`), deux rendus tirés du même fichier :

- `rendu-mail.mjs` → le **corps du mail** : verdict, puces de `synthese`, recommandation, effort.
  Rien d'autre. Pas d'image, pas de tableau, pas de section repliée.
- `rendu-page.mjs` → la **page jointe** : autonome (images en base64, aucune dépendance), un
  **onglet par contribution**. C'est le document qu'on ouvre pour décider, et qu'on peut garder.

  Sa colonne vertébrale, ce sont **deux tableaux** — et dans cet ordre : **« ✓ Ce qu'on garde »**
  (les apports), puis **« ⚠ Ce qu'il faut revoir »** (les défauts, bloquants en tête : gravité ·
  où · le problème · le remède). Viennent ensuite les captures et les arbitrages. Tout le reste —
  le contexte, le glossaire, les angles morts — est **replié** : disponible, mais pas dans le
  chemin de lecture. Un lecteur qui décide balaie deux tableaux ; il ne lit pas des paragraphes.

Les scripts ne réécrivent rien : un champ absent devient une section absente. C'est voulu — un
digest qui invente une section vide donne l'illusion d'une revue complète.

### 10.6 Le piège : un digest qui rassure

Le digest est lu vite, et il porte une couleur. Trois travers à surveiller, chacun déjà vu :

- **Le vert par défaut.** Un critère de verdict qui ne peut pas dire non ne sert à rien : si
  aucune capture n'a pu être prise et qu'aucune règle extérieure n'a pu être sourcée, le verdict
  n'est pas « mergeable », il est « non conclu » — et le digest doit le montrer.
- **La liste de défauts sans hiérarchie.** Douze lignes de même poids se lisent comme du bruit :
  un bloquant en tête, les mineurs repliés en fin de tableau.
- **La recommandation qui renvoie la décision.** « À toi de voir » n'est pas une recommandation.
  Si la décision est vraiment sienne, elle va dans `a_trancher[]` **avec un avis motivé**.
