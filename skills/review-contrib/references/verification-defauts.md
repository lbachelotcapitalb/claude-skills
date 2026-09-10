# Vérifier un défaut avant de le reprocher — et chercher ses jumeaux

Référence de **§5** du skill, seconde moitié. À ouvrir dès qu'un audit (§5) ou un sous-agent
a produit une liste de défauts, et **avant** que le moindre d'entre eux entre dans un
document qui part chez le contributeur (§9.3) ou chez le mainteneur (§6bis).

## Sommaire

- **Pourquoi cette gate existe** — un défaut faux part avec notre signature
- **Les six rationalisations** qui font sauter la vérification
- **Étape 0 — Reformuler le défaut** (la moitié s'effondre ici)
- **Étape 1 — Remonter le flux**, de l'entrée jusqu'au point d'impact
- **Étape 2 — L'avocat du diable**, une passe qui cherche à réfuter
- **Les trois verdicts** et ce que chacun commande
- **Étape 3 — Les variantes** : un défaut confirmé se généralise avant de partir
- **Le registre de vérification**, et son lien avec §9.2

---

## Pourquoi cette gate existe

§5ter a établi qu'une **règle extérieure** fausse dans un rapport de revue est plus grave
qu'ailleurs, parce que le contributeur l'applique, elle devient une constante, elle part en
production, et elle porte notre signature. Exactement le même raisonnement vaut pour un
**défaut de code** :

- Un défaut faux envoyé à un tiers lui fait « corriger » du code qui allait bien — au mieux
  du temps perdu, au pire une régression qu'on aura commandée.
- Il coûte un tour entier de la boucle §9, et le tour suivant démarre avec un contributeur
  qui a raison de douter du reste du rapport.
- Il est très difficile à retirer : un défaut publié se retire mal, on ne « dé-reproche » pas.

Et le biais est mesuré, pas théorique : **un modèle qui cherche des bugs en trouve**, y
compris là où il n'y en a pas, et il surévalue systématiquement la gravité. Un sous-agent de
revue n'est pas une mesure, c'est une hypothèse. La liste qui sort de §5 est une liste de
**suspects**, jamais une liste de défauts.

Le coût est asymétrique et c'est ce qui tranche : vérifier un suspect coûte quelques minutes,
en envoyer un faux coûte un tour de boucle et du crédit.

## Les six rationalisations

| Ce qu'on se dit | Pourquoi c'est faux | Ce qu'on fait |
|---|---|---|
| « les autres, je les passe vite » | Chaque défaut passe la gate entière | Reprendre la liste au suivant |
| « ce motif est dangereux, donc c'est un bug » | Reconnaître un motif n'est pas analyser | Remonter le flux avant de conclure |
| « le code a l'air faux » | Une validation en amont existe peut-être | Aller voir l'amont, pas l'imaginer |
| « le même code était vulnérable ailleurs » | L'autre contexte a d'autres appelants et d'autres garde-fous | Vérifier **cette** occurrence |
| « c'est manifestement bloquant » | La surévaluation de gravité est le biais dominant | Prouver l'impact, ou baisser d'un cran |
| « le sous-agent l'a vérifié » | Il a lu un diff, souvent le mauvais | Rejouer la commande de diff soi-même |

## Étape 0 — Reformuler le défaut

Avant toute analyse, réécris le défaut **avec tes mots**, en quatre champs. C'est l'étape la
plus rentable de tout ce fichier : à peu près la moitié des faux positifs ne survivent pas à
une reformulation précise — la revendication cesse d'avoir un sens dès qu'on doit la dire
proprement.

| Champ | Exemple |
|---|---|
| La revendication | « `formatEur` reçoit `undefined` et affiche `NaN €` » |
| La cause alléguée | « aucune valeur par défaut sur le paramètre, ligne 8563 » |
| Le déclencheur | « un bien sans loyer saisi, écran Rentabilité » |
| L'impact | « chiffre faux affiché à l'utilisateur, pas de plantage » |

Si l'un des quatre ne se remplit pas, le défaut n'est pas prêt à partir : il repart en
analyse, ou il sort de la liste. Et l'impact, écrit noir sur blanc, est ce qui recalibre la
gravité : « chiffre faux affiché » et « données corrompues en base » ne sont pas le même
`BLOQUANT`.

## Étape 1 — Remonter le flux

Partir du point d'impact et remonter jusqu'à l'entrée. La question n'est jamais « ce code
est-il sûr » mais « **peut-on l'atteindre dans cet état** ».

```bash
# Qui appelle le point d'impact, et avec quoi
git grep -n -w '<symbole>' -- src

# Le chemin est-il atteignable ? garde en amont, valeur par défaut, appelant unique
git grep -n -B4 '<symbole>(' -- src | grep -iE 'if|guard|\?\?|\|\||default|valid'
```

Trois issues, et une seule est un défaut :

- **Garde en amont trouvée** → faux positif, et c'est le cas le plus fréquent.
- **Chemin atteignable, mais uniquement par un état que l'app ne produit pas** → à baisser
  d'un cran, en le disant (« atteignable seulement si … »).
- **Chemin atteignable en usage normal** → défaut confirmé, on passe à l'étape 2.

## Étape 2 — L'avocat du diable

Une passe explicite, dont le but est de **réfuter** — pas de confirmer. Formuler la question
à l'envers : « quel argument montrerait que ce défaut n'en est pas un ? » Chercher cet
argument-là, sincèrement, pendant une minute. S'il n'existe pas, le défaut a tenu.

Sur un lot important, déléguer cette passe à un sous-agent **qui n'a pas fait l'audit** et
dont la consigne est de casser, pas de compléter. Un agent qui a produit une liste ne la
réfute pas : il la défend.

## Les trois verdicts

| Verdict | Ce que ça veut dire | Effet sur les documents sortants |
|---|---|---|
| `confirmé` | flux remonté, chemin atteignable, réfutation cherchée et absente | part dans le rapport, avec son chemin de déclenchement |
| `réfuté` | une garde, un appelant ou un invariant l'empêche | **ne part pas** — et si le sous-agent l'avait classé bloquant, le noter dans le registre : c'est ce qui calibre la confiance au tour suivant |
| `non tranché` | on n'a pas su décider en un temps raisonnable | part **étiqueté comme tel**, jamais en `BLOQUANT`, et formulé en question au contributeur (« que se passe-t-il si … ? ») plutôt qu'en reproche |

Un `non tranché` posé en question est utile et honnête : le contributeur connaît son code, il
répondra en une ligne. Le même point envoyé en reproche déclenche une justification, et un
tour de plus.

**Aucun `BLOQUANT` ne sort sans son chemin de déclenchement écrit.** Si tu ne sais pas dire
quelle action de l'utilisateur produit le défaut, ce n'est pas un bloquant — c'est un
`non tranché`.

## Étape 3 — Les variantes

Un défaut confirmé est presque toujours **une manifestation parmi plusieurs**. La même cause
racine a essaimé, et rarement dans le fichier où on l'a trouvée. Envoyer l'occurrence isolée
garantit un tour de boucle supplémentaire quand les autres remonteront.

La montée par paliers, un seul élément généralisé à la fois :

```bash
# 1. La correspondance EXACTE — elle doit trouver l'occurrence connue, et elle seule.
#    Si elle ne trouve rien, la cause racine est mal comprise : tout le reste est calibré
#    sur du vide.
git grep -n -F '<le fragment exact>' -- src

# 2. Généraliser UN élément (le nom de la variable, puis l'appel, puis la forme)
git grep -nE '<motif un cran plus large>' -- src

# 3. Relire TOUTES les correspondances après chaque élargissement.
#    S'arrêter quand plus de la moitié est du bruit — un cran trop loin ne se rattrape pas.
```

Ce qui fait rater une chasse aux variantes : ne chercher que dans le module d'origine ;
chercher un attribut au lieu de la famille autour ; élargir plusieurs éléments d'un coup, ce
qui rend le bruit inattribuable.

Toutes les occurrences trouvées entrent comme **un seul défaut à plusieurs emplacements**,
pas comme N défauts. Le contributeur corrige une cause, pas une liste — et la formulation le
dit : « même cause, aussi en X:112 et Y:340 ».

Quand la cause racine est mécanique (un appel jamais gardé, un format de nombre), demander en
plus **une règle de non-régression** : un test, ou un motif ajouté au scanner du dépôt. C'est
ce qui empêche la variante n°4 de revenir au trimestre suivant.

## Le registre de vérification

Une colonne de plus dans le registre de revue de §9.2 — pas un second fichier, qui divergerait :

| Id | Défaut | Verdict | Chemin de déclenchement | Variantes | Vérifié le |
|---|---|---|---|---|---|
| `I3` | `NaN €` sur un bien sans loyer | confirmé | Rentabilité → bien sans loyer saisi | `App.jsx:8563`, `:9012` | 13/08 |
| `I7` | injection CSV à l'export | réfuté | — (échappement en amont, `csv.js:44`) | — | 13/08 |

Garder les `réfuté` dans le registre. C'est le seul moyen de répondre « on l'a regardé, voilà
pourquoi ce n'en est pas un » quand un audit ultérieur ressort le même suspect — et de voir,
au bout de quelques tours, quel type de suspect ton audit produit à tort.
