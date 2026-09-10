---
name: review-contrib
description: >-
  Contrôler, auditer, RESTITUER et intégrer le commit / la branche / la PR d'un
  collaborateur (souvent depuis un fork) avant merge dans main. Utilise-le quand le mainteneur dit
  « un collaborateur a poussé un commit », « regarde la branche/PR de X », « audite cette
  contribution », « comment adopter ce commit » ; quand la revue s'appuie sur une RÈGLE EXTÉRIEURE
  au dépôt (taux fiscal, plafond légal, barème, seuil réglementaire, limite d'une API tierce) à
  sourcer avant de la reprocher à quelqu'un : « c'est sourcé ? », « d'où sort ce chiffre » ; quand il demande à VOIR la contribution : « fais-moi un HTML de ses
  commits », « qu'est-ce que ça apporte vraiment » ; et quand il faut RENDRE COMPTE au
  contributeur : « écris-lui le retour », « un rapport qu'il puisse corriger », « où en est la
  revue de X ». Couvre la chaîne entière : découverte, conflits, validation, fact-check sur
  source primaire, banc de démonstration à captures, test en worktree, rapport de correction,
  merge. Softcodé par repo.
---

# review-contrib — adopter vite & sûrement les contributions d'un collaborateur

## Version — à contrôler une fois, au chargement

Ce skill est **versionné** : le numéro vit dans `VERSION` (à côté de ce fichier), l'historique
dans `CHANGELOG.md`. Le numéro n'est **jamais recopié ici** — deux copies d'un même numéro
divergent en silence. Au premier tour, lance une fois, depuis le dossier de base annoncé à
l'invocation :

```bash
bash <dossier-du-skill>/scripts/check-update.sh
```

Une requête, 3 s au plus, aucun effet de bord, jamais bloquant. Ce que tu fais de sa sortie :

| Sortie | Ce que tu en fais |
|---|---|
| `à jour (x.y.z)` | rien — ne l'annonce pas, c'est du bruit |
| `NOUVELLE VERSION …` | **dis-le en une ligne** (lien du changelog + commande de mise à jour), puis **continue** : la revue en cours prime, on ne se met pas à jour au milieu |
| `indisponible` / `en avance` | rien, et ne retente pas |

Ne le relance pas aux tours suivants : le skill reste chargé, le numéro ne bougera pas d'ici
la fin de la session.

## Principe immuable
**On ne teste / n'ajuste JAMAIS sur `main`.** Pars du principe que `main` = production
(déploiement automatique — **vérifier par quel remote** : `git remote -v`, ce n'est pas toujours
l'hébergeur annoncé dans la doc, et un même repo peut déployer par un remote dédié). Toute revue
se fait sur une **branche `review/*` dans un worktree séparé** (un 2ᵉ dossier ; le checkout
principal reste sur `main`, intact). Le merge dans `main` n'arrive **qu'une fois tout vert et
validé par le mainteneur**. Pas de « pousser sur main puis nettoyer » — ça publierait du
non-validé.

## Le cycle de vie d'une contribution
`fork/branche du collab` → fetch → **borner à SES commits (§1bis)** → **audit conflits, y
compris contre le travail non mergé du mainteneur (§2, §2bis)** → worktree de revue → **`npm run
audit`** → **audit de code sur DEUX axes : conformité + demande (§5)** → **🔒 gate : vérifier
chaque défaut et chasser ses variantes avant qu'il parte (§5)** → **🔒 fact-check des règles
extérieures (§5ter)** → **banc + HTML de revue (§6)** → **test manuel**

puis, tant que ce n'est pas mergeable : **↻ boucle de correction (§9)** — message au
contributeur → il corrige → re-fetch → **re-mesure** → jusqu'au feu vert (§9.4)

et seulement là : ajustements sur `review/*` → **merge dans `main`** (= go prod).

Quatre erreurs de cadrage tuent la revue avant qu'elle commence : **auditer du code qui n'est pas
de lui** (§1bis) ; **ne comparer qu'à `main`** en ignorant ce que le mainteneur a en attente (§2bis) — ce
qui fait valider un travail qui sera à refaire dans deux semaines ; **n'auditer que la qualité
sans jamais demander si c'est ce qui avait été demandé** (§5) — un code impeccable qui implémente
autre chose passe alors la revue ; et **affirmer une règle
extérieure sans l'avoir lue à la source** (§5ter) — ce qui fait corriger le contributeur dans le
mauvais sens, avec notre signature dessus.

Les deux worktrees ne servent pas à la même chose et ne se confondent pas :

| Worktree | Base | Sert à | Merge ? |
|---|---|---|---|
| `<repo>-review` | `main` + merge de la branche | valider, corriger, merger | oui |
| `<repo>-<collab>` | branche du collab **telle quelle** (detached) | **montrer** ce que ça fait | **non** |

---

## 1. Découvrir le commit (il n'est pas toujours là où on croit)
Un collab pousse souvent sur **son fork** sans ouvrir de PR → invisible dans `git log`.
```bash
gh pr list --state all --limit 20                          # PR ouvertes ?
gh api repos/<owner>/<repo>/collaborators --jq '.[].login' # qui a accès
gh api repos/<owner>/<repo>/forks --jq '.[].full_name'     # forks
gh api repos/<fork>/<repo>/branches --jq '.[].name'        # branches du fork
```
Puis compare sans rien cloner :
```bash
gh api repos/<owner>/<repo>/compare/main...<fork_owner>:<branche> \
  --jq '{ahead:.ahead_by, behind:.behind_by, status:.status,
          commits:[.commits[]|"\(.sha[0:9]) \(.commit.author.name): \(.commit.message|split("\n")[0])"],
          files:[.files[]|"\(.status) +\(.additions)/-\(.deletions) \(.filename)"]}'
```

### 1bis. Borner le périmètre : ses commits, et rien que les siens
On audite **le travail du contributeur**, pas celui du mainteneur. Une branche de fork contient souvent
des commits qui ne sont pas de lui : un `git merge main` qu'il a fait pour se rattraper, des
commits repris, ses propres merges de PR internes. Les auditer, c'est reprocher à quelqu'un du
code qu'il n'a pas écrit — et gonfler la revue de bruit.
```bash
MB=$(git merge-base main <collab>/<branche>)
git log --format='%an' $MB..<collab>/<branche> | sort | uniq -c | sort -rn   # qui a écrit quoi
git log --format='%h %an %s' --merges $MB..<collab>/<branche>                # ses merges internes
# ce qui n'est PAS de lui (à exclure de l'audit) — adapter les identités, il en a souvent deux
# (le nom civil des commits locaux, et le login de la forge quand il commite depuis l'interface web)
git log --format='%h %an %s' $MB..<collab>/<branche> \
  --perl-regexp --author='^(?!<Prénom Nom>|<login>)'
```
Le diff à auditer reste `$MB..<branche>`, mais **le commentaire au contributeur ne cite que les
lignes qu'il a écrites**. Et un commit de merge n'est jamais un défaut : c'est de la plomberie.

Vérifie aussi que les branches « en attente » côté `origin` sont bien du mainteneur : une branche
`origin/review/<sujet>-<collab>` porte le nom du contributeur et contient SES commits — la ranger
avec le travail du mainteneur fausserait le croisement de §2bis.

## 2. Récupérer en local + auditer les conflits (sans rien modifier)
```bash
git remote add <collab> https://github.com/<fork_owner>/<repo>.git 2>/dev/null \
  || git remote set-url <collab> https://github.com/<fork_owner>/<repo>.git
git fetch <collab> <branche>
MB=$(git merge-base main <collab>/<branche>)         # point de divergence
git log --oneline $MB..main                          # ce que main a en plus (risque conflit)
git merge-tree --write-tree --no-messages main <collab>/<branche> >/tmp/mt.txt; echo "exit=$?"
# exit=0 → fusion propre ; exit=1 → conflits.
# Le chemin est SÉPARÉ PAR UNE TABULATION (format "<mode> <oid> <stage>\t<path>") :
# un awk sur les espaces rend une liste vide et fait croire à un faux positif silencieux.
grep -E '^[0-7]{6} [0-9a-f]{40} [123]' /tmp/mt.txt | cut -f2 | sort -u
```

### 2ter. « Déjà refait de notre côté » ne se décrète pas — ça se confronte

Sur une branche en retard, une partie des commits recouvre des zones que `main` a fait évoluer en
parallèle. Le réflexe est de les classer « déjà fait, à droper ». **C'est presque toujours faux**, et
c'est l'erreur la plus coûteuse de la revue : elle jette du travail utile, et elle se voit — le
contributeur, lui, sait ce qu'il a écrit.

Un compteur d'occurrences (`git grep -c "<terme métier>" main` → 37) ne prouve **rien** : il dit que le
sujet existe des deux côtés, pas que les implémentations se recouvrent. Deux versions du même écran
sont le plus souvent **complémentaires** — l'une a l'analyse fine, l'autre la lecture immédiate.

La confrontation, par zone recouverte :

```bash
# 1. Quels fichiers chaque lot touche vraiment
git show --name-only --format="" <ses commits du lot> | sort -u

# 2. Les exports diffèrent-ils ? (le squelette avant le détail)
diff <(git show main:$f | grep '^export') <(git show $C/$b:$f | grep '^export')

# 3. Ses libellés / identifiants : lesquels sont ABSENTS de main ?
#    C'est LA question. Un identifiant à 0 occurrence sur main = un apport réel.
for k in "<libellé d'écran>" "<nom de variable>" "<id d'onglet>"; do
  printf "%-24s main=%s\n" "$k" "$(git grep -c -F "$k" main -- src | awk -F: '{s+=$NF} END{print s+0}')"
done

# 4. Ce que SA version SUPPRIME de main (le sens inverse — celui qu'on oublie)
git diff main:$f $C/$b:$f | grep '^-' | grep -E 'export|import'
```

Trois issues, à distinguer explicitement dans le rapport :
- **apport** — absent de `main`, à conserver. Lui donner un identifiant stable (`A1`, `A2`…) au même
  titre qu'un défaut : le tour suivant doit pouvoir dire « A3 repris, A5 abandonné ».
- **régression** — sa version fait disparaître quelque chose de `main` (un import, un drapeau, une
  branche de calcul). Ça devient un défaut ordinaire (`I<n>`).
- **acquis** — le fichier fusionne sans conflit **et** le blob résultant porte les deux jeux de
  fonctions. À vérifier, pas à supposer :
  ```bash
  T=$(head -1 mt.txt); git ls-tree $T <path>          # récupérer l'OID du blob fusionné
  git cat-file -p <oid> | grep '^export'              # les exports des DEUX côtés y sont-ils ?
  ```
  Un `merge-tree` sans conflit ne dit pas que rien n'est perdu — il dit que git n'a pas eu à
  arbitrer. Lire le résultat.

Le cas le plus intéressant à chercher : un apport qui **corrige une incohérence de `main`** (deux
modules qui calculent la même grandeur sur deux bases différentes). Il n'est visible que depuis ce
croisement, et c'est l'argument qui fait accepter la contribution.

### 2bis. Croiser avec le travail non mergé du mainteneur — les collisions à venir
`merge-tree` contre `main` ne voit qu'une partie du risque. Ce qui fera vraiment mal, c'est la
branche du mainteneur **encore en attente** qui touche les mêmes zones : au moment où elle atterrira,
le travail du contributeur sera à refaire. Il faut le dire **avant** de lui demander un rebase.
```bash
# Ce que le mainteneur a en attente : branches non mergées + WIP non commité
for b in $(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin \
           | grep -v 'origin/HEAD'); do
  a=$(git rev-list --count main..$b 2>/dev/null)
  [ "${a:-0}" -gt 0 ] && echo "$b : $a commit(s) en attente"
done | sort -u
git status --porcelain | grep -v '^??'        # WIP non commité = collision invisible à git

# Collision par fichier — ne compter QUE les commits réellement en attente (main..$b),
# pas tout le diff depuis le merge-base, qui réinclut ce que main a déjà repris.
git diff --name-only $MB <collab>/<branche> | sort > /tmp/f_contrib.txt
git log main..$b --name-only --format= | sort -u | grep . > /tmp/f_b.txt
comm -12 /tmp/f_contrib.txt /tmp/f_b.txt

# Conflit réel entre les deux branches (le fichier commun ne prouve pas le conflit)
git merge-tree --write-tree --no-messages $b <collab>/<branche> >/tmp/mt2.txt; echo "exit=$?"
```
Mesuré sur un cas réel : le merge contre `main` seul annonçait 7 fichiers en conflit, mais deux
branches encore en attente en ajoutaient un 8ᵉ (un module de calcul partagé) — invisible tant
qu'on ne croise pas. Ce genre de fichier doit partir dans le message au
contributeur comme « zone à ne pas retoucher / à rebaser en dernier ».

Restituer en tableau, une ligne par branche en attente :

| Branche du mainteneur en attente | Commits | Fichiers en commun | Conflit réel | Ce qu'on demande au contributeur |
|---|---|---|---|---|
| `wip/<sujet>` | 8 | 6 | ⚠️ `<module>.js` en plus | ne pas toucher ce module, ou rebaser après |

## 3. Worktree de revue + fusion (main reste intact)
```bash
git worktree add -f ../<repo>-review main
cd ../<repo>-review
git checkout -b review/<sujet>
git merge --no-ff --no-commit <collab>/<branche>     # résoudre les conflits ici
git diff --name-only --diff-filter=U                 # fichiers en conflit
# … résoudre (souvent trivial sur le mono-fichier : un calcul UI, etc.) …
npm install                                          # si nouvelle dépendance
```

## 4. Validation automatique (la garde)
```bash
npm run audit        # = lint + secrets:scan + test + build (cf. package.json)
npm run build        # relire la sortie : un gros chunk doit être code-splité (await import),
                     # pas dans le bundle initial. Refuser un ajout lourd au bundle initial.
```
Comparer le diff aux périmètres sensibles : `SCHEMA_VERSION` (migration), `storage key`,
edge functions / RLS, secrets.

## 5. Audit de code — deux axes, puis une gate de vérification

L'audit se joue sur **deux axes indépendants**, en parallèle, dans deux sous-agents séparés :

- **conformité** — le code est-il correct, sûr, conforme aux conventions du dépôt ?
- **demande** — fait-il ce qui avait été demandé, ni moins (manquant) ni plus (dérive de
  périmètre) ?

Le second est celui qu'on saute, et c'est le plus rentable sur une contribution externe : le
contributeur a travaillé loin de nos arbitrages. Découvrir au troisième tour de §9 qu'il a
construit le mauvais objet coûte trois tours. Les deux axes se restituent **côte à côte, sans
être fusionnés** — fusionner reclasse, et un défaut de conformité bien formulé masque alors un
écart de périmètre mal formulé.

La manœuvre complète — triage par **risque** et non par taille du diff, rayon d'impact compté,
couverture de test du diff, prompts des deux sous-agents, rationalisations qui font sauter une
étape — est dans **[references/audit-code.md](references/audit-code.md)**.

### Le moteur de l'axe conformité : `/code-review`, s'il est disponible

Claude Code embarque un `/code-review` (flotte d'agents en parallèle, cible `<PR#>` / branche /
chemin, niveaux `low`→`max`, `ultra` en cloud). Sur la **détection** pure, il fait mieux qu'un
sous-agent écrit à la main : c'est donc lui qui joue l'axe conformité quand il est là, et le
prompt de [references/audit-code.md](references/audit-code.md) ne sert que de repli. Ce qu'il ne remplace pas, et pourquoi :

| Il ne connaît pas | Conséquence |
|---|---|
| le périmètre de §1bis | sur `<PR#>`, il audite **tout** le diff, commits du mainteneur compris — filtrer ses trouvailles avant de les attribuer |
| le cadrage d'origine | l'axe **demande** reste à jouer séparément : il ne sait pas ce qu'on avait commandé |
| la boucle §9 | ses trouvailles n'ont pas d'identifiant stable — les verser au registre §9.2 en les renumérotant |

⚠️ **Jamais `--comment` sur la PR d'un contributeur, ni `--fix` sur sa branche.** `--comment`
publie les trouvailles en commentaires inline, sous ton nom, **avant** la gate de vérification —
c'est très exactement ce que la gate existe pour empêcher. Sur une contribution externe, on lit la
sortie, on la vérifie, et on écrit soi-même. `--comment` reste bon sur ta propre PR.

**Ce que rend un sous-agent est une liste de SUSPECTS, jamais une liste de défauts.** Un modèle
qui cherche des bugs en trouve, y compris là où il n'y en a pas, et il surévalue la gravité.
Rien ne part chez le contributeur sans passer la gate de
**[references/verification-defauts.md](references/verification-defauts.md)** : reformuler le
défaut en quatre champs (la moitié s'effondre là), remonter le flux jusqu'à l'entrée, chercher
à le **réfuter**, puis chasser ses **variantes** — une cause racine a presque toujours essaimé,
et envoyer l'occurrence isolée garantit un tour de boucle de plus. Le coût est asymétrique :
vérifier prend quelques minutes, envoyer un défaut faux coûte un tour et du crédit.

Restituer au mainteneur en **vrai tableau markdown**, pas en puces ni en prose :

| Fichier:ligne | Sévérité | Problème | Correctif |
|---|---|---|---|
| `App.jsx:8563` | IMPORTANT | … | … |

Une ligne = un problème, une phrase courte par colonne. Un point non tranché se dit dans la
colonne Sévérité (`IMPORTANT (à confirmer)`) plutôt que noyé dans une parenthèse de prose — et
aucun `BLOQUANT` ne sort sans son chemin de déclenchement écrit.

## 5bis. Vue d'ensemble « en attente » (quand plusieurs sources/branches coexistent)
Dès qu'il y a plus d'une contribution ou plus d'un repo/remote en jeu (preview, prod, forks
multiples), donner au mainteneur un **tableau d'état** avant de détailler quoi que ce soit — ça répond
tout de suite à « qu'est-ce qui attend d'être poussé où » sans qu'il ait à le redemander :

| Où | Contenu | Statut | Action |
|---|---|---|---|
| `main` ↔ preview ↔ prod | — | ✅ synchronisés / ⚠️ désynchronisés (préciser le delta) | … |
| Branche locale/fork X | résumé en 3-5 mots | ⏳ non auditée / ✅ auditée / 🗑️ obsolète | à auditer / à corriger / supprimable |

Vérifier les remotes de déploiement (`git remote -v`, comparer les HEAD de `main`, `preview`,
`prod`) avant d'affirmer qu'ils sont synchronisés — ne pas supposer.

## 5ter. Fact-check des règles extérieures — la boucle, AVANT de produire

Dès que la revue s'appuie sur une **règle qui ne vient pas du dépôt** — un taux fiscal, un plafond
légal, un seuil réglementaire, un barème, une date d'effet, une norme, une limite d'API tierce — cette
règle doit être **lue à la source** avant d'entrer dans un document qui part chez le contributeur.

C'est la doctrine du fact-check éditorial transposée à la revue de code : **le contrôle se
fait au sourcing, pas à la production.** Ici, le sourcing c'est l'audit (§1 à §5), la production c'est
la page (§6) et le rapport (§9.3). Vérifier au moment d'écrire le rapport, c'est découvrir l'erreur
quand le document est déjà rédigé — trop tard pour autre chose que tout reprendre.

**Pourquoi c'est plus grave ici que dans une newsletter.** Une valeur fausse dans un rapport de revue
n'est pas lue puis oubliée : le contributeur (ou son IA) **l'applique**, elle devient une constante, elle
part en prod, et elle porte notre signature. On lui aura fait écrire un bug en lui reprochant le sien.

### La boucle

```
1. RECENSER  toute assertion extérieure du futur rapport → une ligne dans un registre d'assertions
2. SOURCER   chacune : ouvrir le TEXTE, pas un commentaire du texte
3. TRANCHER  vrai · faux · non_source, avec un NIVEAU de confiance
4. CORRIGER  nos documents ET, si besoin, le tableau des défauts (le nôtre bouge aussi)
5. RE-VÉRIFIER ce qu'on vient d'écrire — les corrections introduisent leurs propres erreurs
   ↻ borner à 2 tours ; au 3ᵉ, on sort ce qu'on a en étiquetant ce qui reste douteux
```

### Les trois verdicts, et ce qu'ils commandent

La distinction paraît scolaire ; elle a été payée cher :

| Verdict | Définition | Effet |
|---|---|---|
| `vrai` | le texte confirme | passe |
| `faux` | **une source contredit** — l'erreur est prouvée | **bloque** : aucun document ne sort avec un `faux` ouvert |
| `non_source` | rien ne l'établit — absence de preuve, pas preuve d'erreur | **ne bloque pas**, mais **doit être étiqueté dans le document lui-même** |

Et deux niveaux de confiance, à afficher :

- **P** — source primaire atteinte : Légifrance, BOFiP, le JO, la doc officielle de l'éditeur.
- **S** — sources professionnelles concordantes, texte cité mais non lu. **Jamais présenté comme une
  certitude**, ni au contributeur ni au mainteneur.

`non_source` ne doit **jamais** vouloir dire « je n'ai pas su ouvrir le document » : épuiser d'abord le
PDF illisible → la page HTML du même texte → un autre hébergeur du même texte. Et **`PARTIEL` n'est pas
vert** : une assertion jamais regardée n'est pas une assertion saine.

### Les cinq pièges, tous rencontrés en vrai (revue à contenu réglementaire, 08/2026)

1. **Une source secondaire peut dire l'exact inverse du texte.** Trois commentaires professionnels
   concordants annonçaient « les PEL/CEL ouverts *depuis* 2018 restent au taux réduit ». Le code de la
   sécurité sociale vise les CEL ouverts *jusqu'au* 31/12/2017. On s'apprêtait à envoyer à un tiers une
   règle retournée. **La concordance de sources secondaires n'est pas une preuve** — elles se recopient.
2. **Un texte qui renvoie n'est pas sourcé tant que le renvoi n'est pas ouvert.** L'article portait
   « les revenus mentionnés au a du I de l'article L. 136-6 » : tant qu'on n'a pas lu L. 136-6, on n'a
   rien lu. Décoder les renvois est la moitié du travail, et c'est là que se cachent les exclusions.
3. **Lire la DATE DE VERSION du texte, toujours.** L'article avait été modifié par une loi de juin,
   postérieure à celle que toutes les analyses commentaient. Un socle sourcé il y a six mois est un
   socle périmé : **re-vérifier à chaque tour de la boucle §9**, pas une fois pour toutes.
4. **Une liste limitative se vérifie dans les deux sens.** Un item annoncé par une source (« les
   plus-values professionnelles à long terme sont exclues ») était simplement absent du texte. Compter
   les items, pas seulement reconnaître ceux qu'on cherchait.
5. **Un taux unique dans le code est un signal d'alerte.** Quand une règle se met à dépendre du support
   (l'enveloppe, le millésime, le statut), une constante unique réutilisée partout devient fausse
   silencieusement dans la moitié des cas. Le chercher explicitement : `grep` sur la constante, puis
   vérifier **chaque** appelant contre la règle.

### Le registre d'assertions

Il vit à côté du registre de revue (§9.2), dans le même dossier, et **survit entre les tours** :

```bash
D=~/<dossier-de-travail>/<repo>-revue-<collab>
# une ligne par assertion extérieure du rapport
```

| Assertion | Où elle sert | Source | Niveau | Verdict | Re-vérifiée le |
|---|---|---|---|---|---|
| PS immobilier maintenus à 17,2 % | `B3`, `I11`, page §fiscal | L. 136-8, IV CSS (v. 27/06/2026) | **P** | vrai | 04/08 |
| dates d'effet distinctes patrimoine / placement | `.md` §2.2 | art. 12, II LFSS 2026 | **S** | vrai | 04/08 |

Ce registre est ce qui permet, trois tours plus tard, de répondre « d'où sort ce chiffre » sans
refaire l'enquête — et de repérer d'un coup d'œil les lignes **S** qu'on n'a jamais durcies.

### Ce qui entre dans les documents sortants

- **Le rapport (§9.3)** cite la source **dans la fiche du défaut** : texte, article, date de version.
  Une correction chiffrée sans sa source est une correction que son IA n'a aucun moyen d'arbitrer.
- **La page (§6)** ne porte pas les références juridiques dans le tableau des défauts — elles
  l'alourdiraient — mais **le glossaire les porte**, en une ligne par terme.
- **Ce qui reste en `S` est dit comme tel**, dans le document, à l'endroit où c'est utilisé. « Je n'ai
  pas lu le texte lui-même » est une phrase acceptable ; laisser croire au contraire ne l'est pas.
- **Ne jamais faire inventer une valeur au contributeur.** Sans source, on demande un marqueur de doute
  dans le code, pas une correction (cf. §9.3, « cinq réflexes »).

## 6. Restituer : le banc de démonstration + la page HTML commune

Un tableau de défauts dit ce qui cloche ; il ne dit pas **ce que la contribution apporte**. Quand
le mainteneur demande à voir, la réponse n'est ni un tableau ni une maquette : c'est **sa branche
qui tourne, capturée**. Une capture inventée serait un mensonge sur un travail qu'on s'apprête à
juger.

Le montage du banc isolé, la prise des captures réelles et le gabarit de la page HTML commune au
mainteneur et au contributeur sont dans
**[references/restitution-html.md](references/restitution-html.md)**.

## 6bis. Restituer à un mainteneur qui ne lit pas le code (le digest décisionnel)

§6 montre la contribution, §9 s'adresse au contributeur. Il reste celui qui **décide** et qui
n'est pas développeur : il ne veut pas un audit, il veut trancher. Il lui faut, dans l'ordre, un
verdict, ce que ça change pour l'utilisateur, ce qui cloche (chiffré, en métier), des captures
légendées de SON app qui tourne, une recommandation exécutable, et ce qui est à trancher.

La règle de fond : **le modèle écrit la matière, un script écrit la forme.** La session d'audit
dépose un `restitution.json` (schéma commenté :
[references/restitution.schema.json](references/restitution.schema.json)) et des `captures/` ;
le rendu HTML est déterministe. Un digest rédigé librement dérive d'un tour à l'autre et finit
par ne plus rien vouloir dire.

La deuxième règle : **le mail est court, la page est complète.** Le mail ne porte que les 2 à 4
puces de `synthese`, le verdict, la recommandation et l'effort — ce qu'on retient si on n'ouvre
jamais la pièce jointe. Le détail, les captures et les arbitrages vivent dans une page jointe
autonome à onglets. Et les longueurs du schéma sont des **budgets** : une phrase qui déborde se
coupe, elle ne se reformule pas — le raisonnement a déjà son domicile, `audit.md`.

Les six règles d'écriture (aucun terme technique sans définition, un symptôme se chiffre, une
conséquence se dit en métier, une recommandation est un ordre exécutable, ce qui n'a pas été
vérifié se dit, ce qui est bon se dit aussi) et le piège du « digest qui rassure » sont dans
**[references/restitution-pedago.md](references/restitution-pedago.md)**.

## 7. Test manuel par le mainteneur (le « avant » du merge)
```bash
cd ../<repo>-review && npm run dev      # localhost — main n'est pas touché, rien n'est déployé
```
Donner l'URL au mainteneur + la **liste des bugs connus** (issus de l'étape 5) pour qu'il teste en
connaissance de cause. Il valide la feature **sur cette branche**, pas sur main.

## 8. Ajuster puis merger
Appliquer les correctifs (BLOQUANT + IMPORTANT) sur `review/<sujet>`, relancer `npm run audit`.
Quand le mainteneur dit OK :
```bash
git checkout main && git merge --no-ff review/<sujet>   # go prod — UNIQUEMENT validé
git push origin main                                    # seulement sur accord explicite du mainteneur
git worktree remove ../<repo>-review                    # nettoyage
git worktree remove --force ../<repo>-<collab>          # le banc : patchs jetables, rien à sauver
```
Alternative sans merge immédiat : pousser `review/<sujet>` et **ouvrir une PR** pour garder la
trace / laisser Netlify faire une preview deploy.

## 9. La boucle de correction avec le contributeur (jusqu'au feu vert)

La revue n'est pas un verdict, c'est **un aller-retour qu'on rejoue jusqu'à ce que ce soit
mergeable**. Quatre exigences que la revue d'un seul tour n'a pas : un défaut actionnable SANS
le contexte de la session, un registre à identifiants STABLES entre les tours, un feu vert
qui se prouve, et **une langue que le destinataire comprend**. Tout le protocole — format des
défauts, registre, re-mesure, critères du feu vert, règles d'écriture — est dans
**[references/boucle-correction.md](references/boucle-correction.md)** : ouvre-le dès qu'un
premier retour part au contributeur.

**La quatrième exigence est celle qu'on saute** (§9.5), parce qu'elle ne se voit pas : un rapport
exact que le contributeur ne comprend pas produit le même résultat qu'un rapport faux — il ne
corrige rien, et il ne le dit pas. Le piège est que tu relis avec le contexte qu'il n'a pas, donc
**ta propre relecture ne prouve rien**. Trois réflexes, le détail en §9.5 :
- jamais un identifiant, un sigle ou un mot technique **nu** — on nomme la chose par ce qu'elle
  FAIT, l'identifiant vient derrière, entre parenthèses ;
- **aucun renvoi qu'il ne peut pas résoudre seul** : ni `B4`, ni le nom d'un de nos scripts, ni
  « cf. le rapport précédent » — on redit en une clause de quoi il s'agit ;
- un défaut se raconte **par ce qu'on voit à l'écran**, avant tout mot de code.

Le contrôle honnête n'est pas de se relire : c'est de faire résumer le document par un sous-agent
qui n'a pas suivi la session. S'il reste vague, c'est le document.

## Industrialiser (pour que ça arrive tout cuit la prochaine fois)
Demander aux collab d'**ouvrir une PR** depuis leur fork (l'unité de revue). Côté repo :
- **CI** : un workflow GitHub Actions qui lance `npm run audit` sur chaque PR → gate vert obligatoire.
- **`.github/CODEOWNERS`** : exiger la revue du mainteneur avant merge.
Une PR + CI verte + revue assistée = adoption en minutes.

## Garde-fous du mainteneur
- `main` = prod → jamais de WIP/non-validé dessus, jamais de `push origin main` sans accord explicite.
- Worktrees = dossiers jetables à côté ; `git worktree remove` à la fin.
- Une nouvelle dépendance lourde n'est acceptable que **code-splitée en import dynamique** (impact bundle initial nul).
- **Le banc de démonstration ne touche jamais une base réelle** : env injoignable + autosave coupé.
  Une branche de collab peut porter une migration de schéma ; la laisser écrire, c'est corrompre
  des données de production pour une capture d'écran.
- Les patchs du banc (auth court-circuitée, `demoState.js`, onglet forcé) **ne sont jamais commités**.

## Orchestration
- **`/code-review` est un détecteur, ce skill est un protocole d'adoption** — ils ne se
  concurrencent pas, ils s'emboîtent (§5). Sur ton propre code, sur ta propre branche, sans
  personne à qui rendre des comptes : `/code-review` seul, et ce skill n'a rien à faire là. Il ne
  s'allume que quand il y a un **tiers** dans la boucle — quelqu'un à qui envoyer un rapport, ou
  quelqu'un à qui rendre un verdict.
- Miroir côté contributeur : le skill `contribuer` — ce que cette revue va vérifier, il le fait
  lui-même avant d'ouvrir la PR. Le donner au collaborateur fait gagner un tour entier.
- Clôture par la preuve (skill `verify`, si tu l'as) : la preuve qu'on rend est le livrable que le
  mainteneur review, il ne retestera pas lui-même. Ici la preuve, ce sont les captures — donc
  jamais de maquette.
- Le §5ter est la transposition à la revue d'une doctrine de fact-check éditorial : même logique,
  autre objet — ici ce n'est pas une publication qu'on désarme, c'est un rapport qu'on refuse
  d'envoyer tant qu'une règle extérieure y est fausse.
