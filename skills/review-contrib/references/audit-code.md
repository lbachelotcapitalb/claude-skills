# L'audit de code d'une contribution — deux axes, un triage par risque

Référence de **§5** du skill. À ouvrir au moment de lancer l'audit, pas avant.

Ce fichier porte la manœuvre d'audit elle-même. Ce qu'on fait des défauts **une fois trouvés**
— les vérifier avant de les reprocher, chercher leurs variantes — est dans
[verification-defauts.md](verification-defauts.md), et c'est la moitié qui compte.

## Sommaire

- **Pourquoi deux axes** — conforme ≠ conforme à ce qui a été demandé
- **Les rationalisations** — les six phrases qui font sauter une étape
- **Étape 1 — Triage par risque** (jamais par taille du diff)
- **Étape 2 — Le rayon d'impact**, compté et non estimé
- **Étape 3 — La couverture de test** du code touché
- **Étape 4 — Les deux sous-agents**, en parallèle, prompts fournis
- **Étape 5 — Restituer**, et ce qui n'a PAS été couvert

---

## Pourquoi deux axes

Un audit qui ne regarde que la qualité du code répond à « est-ce bien écrit ». Il ne répond
jamais à « est-ce ce qu'on avait demandé ». Les deux échouent séparément :

| Cas | Conformité | Demande |
|---|---|---|
| Code impeccable qui implémente autre chose | ✅ | ❌ |
| Code qui fait exactement ce qu'on voulait, hors conventions du repo | ❌ | ✅ |
| Trois écrans en plus que personne n'a demandés | ✅ | ❌ (dérive de périmètre) |

Sur une contribution **externe**, le second axe est le plus rentable et c'est celui qu'on
saute : le contributeur a travaillé loin de nous, sans nos arbitrages, souvent depuis une
issue lue de travers. Découvrir au troisième tour de la boucle §9 qu'il a construit le mauvais
objet, c'est trois tours perdus — et un contributeur qui ne reviendra pas.

Les deux axes tournent **en parallèle, dans deux sous-agents séparés**, et se restituent
**côte à côte sans être fusionnés**. Fusionner reclasse : un défaut de conformité bien
formulé masque un écart de périmètre mal formulé, et c'est précisément ce que la séparation
empêche.

## Les rationalisations

Six phrases qui se pensent toutes seules au milieu d'un audit. Si l'une te traverse, c'est
le signal d'arrêt, pas le feu vert :

| Ce qu'on se dit | Pourquoi c'est faux | Ce qu'on fait à la place |
|---|---|---|
| « petit diff, revue rapide » | Heartbleed tenait en deux lignes | Classer par **risque**, jamais par taille |
| « je connais ce code par cœur » | La familiarité fabrique les angles morts | Établir la base de comparaison explicitement |
| « le rayon d'impact est évident » | Les appelants transitifs, non | Le **compter** (étape 2) |
| « pas de tests, c'est son problème » | Un correctif non testé est un correctif à risque élevé | Élever la sévérité et le dire |
| « juste un refactor, pas d'impact » | Un refactor casse des invariants | Traiter comme risque élevé jusqu'à preuve du contraire |
| « je l'expliquerai de vive voix » | Sans trace écrite, la trouvaille est perdue au tour suivant | Une ligne dans le registre §9.2, toujours |

## Étape 1 — Triage par risque

Classer **chaque fichier du diff**, pas le diff en bloc. Le budget d'attention va au risque
élevé ; le reste passe en lecture rapide et c'est assumé.

| Risque | Ce qui déclenche |
|---|---|
| **Élevé** | authentification, droits, secrets, écriture en base, migration de schéma, appel externe, calcul monétaire ou fiscal, **suppression** d'une validation |
| **Moyen** | logique métier, changement d'état, nouvelle surface publique (export, route, outil MCP) |
| **Faible** | commentaires, tests, libellés, présentation, journalisation |

Deux règles maison qui priment sur la grille :

- **Une validation retirée est toujours un risque élevé**, même si le diff est d'une ligne.
  Chercher explicitement le sens inverse : `git diff $MB <branche> | grep '^-' | grep -iE
  'valid|check|assert|guard|throw|sanitize|escape'`.
- **Tout ce qui touche à un montant, un taux ou une date d'effet** part en risque élevé et
  déclenche §5ter (fact-check sur source primaire). Un chiffre faux ne se voit pas à la
  relecture ; il se voit en production, six mois plus tard.

Adapter la profondeur à la taille du dépôt : sous 20 fichiers touchés, lire aussi les
dépendances directes ; entre 20 et 200, se limiter aux fichiers prioritaires et à un saut de
dépendance ; au-delà, ne traiter que les chemins critiques — **et le dire dans la
restitution** (étape 5).

## Étape 2 — Le rayon d'impact, compté

Une fonction modifiée n'est pas un problème local tant qu'on n'a pas compté qui l'appelle.
L'estimation à l'œil rate systématiquement les appelants transitifs.

```bash
# Les symboles que le diff modifie
git diff $MB <collab>/<branche> -- <fichier> | grep -E '^[-+].*(function|const|export|=>)' \
  | grep -oE '\b[a-zA-Z_][a-zA-Z0-9_]*\s*[=(]' | tr -d ' =(' | sort -u

# Pour chacun : combien d'appelants, et où
for s in <symbole1> <symbole2>; do
  printf "%-28s %s appel(s)\n" "$s" "$(git grep -c -w "$s" main -- src | awk -F: '{n+=$NF} END{print n+0}')"
done
```

Sur un dépôt mono-fichier, `git grep` compte dans un seul fichier : croiser avec
le numéro de ligne pour distinguer une définition de ses appels, sinon le compteur ment.

Un symbole à fort rayon d'impact **modifié en risque élevé** est le cas qui justifie de
demander un test au contributeur plutôt qu'une correction : c'est le seul endroit où le test
coûte moins cher que la vérification manuelle à chaque tour.

## Étape 3 — La couverture de test du code touché

On ne mesure pas la couverture du dépôt, on mesure celle **du diff** :

```bash
git diff --name-only $MB <collab>/<branche> | grep -vE '\.(test|spec)\.' > /tmp/prod.txt
git diff --name-only $MB <collab>/<branche> | grep -E '\.(test|spec)\.'  > /tmp/tests.txt
wc -l /tmp/prod.txt /tmp/tests.txt
```

Zéro test sur un lot en risque élevé n'est pas un défaut à part : c'est un **multiplicateur
de sévérité** sur tous les autres défauts du lot, et ça se dit ainsi dans la restitution.
Reprocher « il manque des tests » en ligne séparée produit un contributeur qui ajoute trois
tests vides.

## Étape 4 — Les deux sous-agents

Récupérer d'abord le diff exact et **borné à ses commits** (§1bis) :
`git diff $MB <collab>/<branche> -- <fichiers>`.

**Sous-agent « conformité »** — lui donner : le diff, la liste des fichiers par niveau de
risque (étape 1), les conventions du dépôt (`CLAUDE.md`, `CONTRIBUTING.md`, `MAP.md` s'il
existe), et cette consigne :

> Rends un tableau : fichier:ligne · sévérité · problème en une phrase · correctif en une
> phrase. Cherche par priorité — correction (cas limites, `null`, parsing des nombres au
> format FR), sécurité (injection, XSS, fuite de données personnelles, injection de formule
> dans un CSV quand une valeur commence par `= + - @`, affaiblissement d'un scanner),
> persistance et migration, conventions du dépôt (cite la règle et son fichier), qualité
> (code mort, `try/catch` absent, journalisation oubliée). Distingue ce qui **viole une
> règle écrite** (dur) de ce qui relève du **jugement** (à discuter). Ignore ce qu'un outil
> automatique attrape déjà — le `npm run audit` est passé. 400 mots maximum.

**Sous-agent « demande »** — lui donner : le diff, la liste des commits, et la demande
d'origine (issue, message de cadrage, fil de discussion, ou ce que le mainteneur a
effectivement demandé). Consigne :

> Rends trois listes courtes. (a) Ce que la demande prévoyait et qui est **absent ou
> partiel**. (b) Ce que le diff apporte et que **personne n'a demandé** (dérive de
> périmètre) — sans juger de sa qualité, la question est seulement : était-ce dans le
> cadrage ? (c) Ce qui a l'air implémenté mais **répond de travers** à la demande. Cite la
> phrase de la demande pour chaque point. 400 mots maximum.

S'il n'y a **pas** de demande écrite, ne pas inventer d'axe : le noter tel quel dans la
restitution (« aucun cadrage écrit — l'axe périmètre n'a pas pu être joué »). C'est en soi
une information pour le mainteneur, et la cause la plus fréquente des revues qui s'éternisent.

⚠️ Un point de la liste (b) n'est **pas** un défaut. Un apport hors cadrage peut être
excellent — c'est un `A<n>` de §2ter, à arbitrer par le mainteneur, pas un `I<n>` à
reprocher. Les confondre, c'est punir quelqu'un d'avoir bien travaillé.

## Étape 5 — Restituer

Rien de ce que rend un sous-agent ne part sans être passé par
[verification-defauts.md](verification-defauts.md) : **ils se trompent de base de diff, et
ils surévaluent la gravité**. C'est structurel, pas accidentel.

Restituer les deux axes **sous deux titres distincts**, chacun avec son tableau, sans
classement commun. Puis, en une ligne : le pire point de chaque axe, et **ce qui n'a pas été
couvert** — profondeur réduite pour cause de taille (étape 1), absence de cadrage écrit
(étape 4), zone non testée manuellement. Une revue qui n'annonce pas ses limites se fait
lire comme exhaustive.
