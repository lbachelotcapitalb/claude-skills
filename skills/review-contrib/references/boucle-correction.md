# §9 — La boucle de correction avec le contributeur

## Sommaire

- 9.1 Chaque défaut doit être actionnable SANS le contexte de la session
- 9.2 Un registre qui survit entre les tours
- 9.3 Le rapport au contributeur — écrit pour SON IA, pas pour lui seul
- 9.4 Le critère de sortie, annoncé dès le premier tour
- 9.5 La langue : écrire pour quelqu'un qui n'a pas le dépôt ouvert


La revue n'est pas un verdict, c'est **un aller-retour qu'on rejoue jusqu'à ce que ce soit
mergeable**. Ça impose trois choses que la revue d'un seul tour n'a pas besoin d'avoir.

### 9.1 Chaque défaut doit être actionnable SANS le contexte de la session
Le contributeur n'a ni le banc, ni le worktree, ni la conversation. Un défaut qui ne dit que
« le 757 B est faux » lui coûtera une demi-journée à retrouver. Le format minimal, quatre champs :

| Champ | Pourquoi il est obligatoire |
|---|---|
| **Où** | `fichier:ligne` sur SA branche (pas sur `main`, qu'il n'a pas) |
| **Attendu vs obtenu** | des chiffres, pas une opinion — « 52 094 € au lieu de 0 € » |
| **Comment reproduire** | le cas exact qui le déclenche (le dossier du banc sert à ça) |
| **Comment vérifier** | le test à écrire ou la commande qui doit passer au vert |

Sans le « comment vérifier », le tour suivant se rejoue à l'aveugle et on repart pour un cycle.

### 9.2 Un registre qui survit entre les tours
Sans état, le tour 2 ne sait pas ce qui a été corrigé, ce qui a été refusé, ni pourquoi. Tenir
`revue-<collab>.md` **hors du dépôt** (dans un dossier de travail dédié) :
```bash
D=~/<dossier-de-travail>/<repo>-revue-<collab>   # un DOSSIER : le registre y côtoiera
mkdir -p $D                                           # le prompt de reprise et les notes du tour
cp ~/.claude/skills/review-contrib/references/registre-revue.md $D/registre.md
```
Le gabarit porte l'état (branche, tour, défauts, collisions, journal) **et** le message à
envoyer. Identifiant stable par défaut (`B1`, `I3`), jamais renuméroté : c'est la seule chose
qui permette de dire « B1 corrigé, I3 toujours ouvert » sans tout recopier.

Statuts : `ouvert` · `corrigé` (vérifié par nous, pas déclaré par lui) · `contesté` (il a une
raison — la noter, elle peut être bonne) · `reporté` (accepté pour plus tard, avec la raison).

**Un défaut ne passe à `corrigé` qu'après re-fetch et re-mesure.** « Il dit que c'est fait »
n'est pas une preuve : c'est exactement le piège du voyant vert que personne ne relit.

### 9.3 Le rapport au contributeur — écrit pour SON IA, pas pour lui seul

**Trois livrables au total, deux seulement partent chez le contributeur :**

| Livrable | Pour qui | Rôle |
|---|---|---|
| la page HTML de §6 (à captures, voyants) | **le mainteneur ET le contributeur** | comprendre et décider |
| `revue-<collab>-POUR-<COLLAB>.md` | le contributeur **et son assistant de code** | **corriger** |
| le registre de §9.2 | le mainteneur, entre les tours | **suivre** les statuts |

Le contributeur corrigera presque certainement **avec une IA**. C'est ça le vrai lecteur du `.md`,
et ça change tout : elle n'a ni `main`, ni le banc, ni la conversation, ni le droit fiscal qui a
bougé. Un rapport « suffisant pour un humain qui connaît le projet » la fera corriger de
travers, et on repart pour un tour complet.

Le `.md` **peut** être rendu en HTML si le contributeur n'a pas d'éditeur markdown, avec
`references/md2page.mjs` (convertisseur maison, sans dépendance ni réseau, ancre `id="B1"` par
fiche). Ce n'est pas le cas par défaut : depuis que la page de §6 est commune aux deux, un
troisième document fait doublon. **Le `.md` reste la source unique** — jamais deux versions du même
contenu maintenues à la main, elles divergent au premier correctif.
```bash
node ~/.claude/skills/review-contrib/references/md2page.mjs <rapport>.md <sortie>.html "<titre>"
```

#### L'ordre du rapport
1. **Comment lire ce document** — les `fichier:ligne` désignent SA branche au SHA mesuré ;
   quand on cite l'amont, on le préfixe (`amont:src/…`). Les identifiants sont stables.
2. **Ce qui est retenu**, nommé et argumenté. Une revue qui n'ouvre que sur des reproches fait
   perdre un contributeur ; dire que ses 4 modules sont bons coûte deux lignes.
3. **Le blocage structurel** — « ta branche a N commits de retard » — et l'ordre de travail :
   rebase d'abord, corrections ensuite. Sinon il corrige sur une base qui va bouger.
4. **L'état de l'amont qu'il ne peut pas deviner** ← *la section décisive, voir plus bas.*
5. Les bloquants, puis les importants, puis les mineurs, au format ci-dessous.
6. Ce qu'on lui demande de **ne pas** toucher (les collisions de §2bis).
7. Le critère de sortie (§9.4), et un récapitulatif en tableau.

#### La section qui décide de tout : « ce que tu ne peux pas deviner »
Son code n'est presque jamais faux dans l'absolu — il est **juste pour l'état du dépôt au jour
de sa divergence**. Écris noir sur blanc, avec les valeurs et les numéros de ligne de l'amont :
- **les constantes/règles métier qui ont changé depuis**, et *pourquoi* (la source, la date
  d'effet). Et surtout les **exceptions contre-intuitives** — c'est là qu'un refactor bien
  intentionné casse quelque chose. *(Ici : le taux global monte, mais une base précise est
  exclue de la hausse — deux constantes distinctes que sa refonte a fusionnées.)*
- **les API que l'amont attend de ses fichiers** : quel export, importé par quel fichier. Sans
  ça, un conflit `add/add` se « résout » en supprimant une fonctionnalité entière.
- **la liste de tests / la config de l'amont**, quand la sienne est plus courte : dire lesquels
  manquent, nommément, et que la résolution est une **union**.
- **les numéros de version** (schéma de données, format d'export) des deux côtés.

Sans cette section, chaque correction est un pari. Avec elle, son IA a de quoi trancher seule.

#### Le format d'une fiche — sept champs, pas quatre
§9.1 donne le minimum pour un humain. Pour une IA tierce, il faut :

| Champ | Ce qu'il évite |
|---|---|
| **Où** | `fichier:ligne` sur SA branche |
| **Code actuel, cité** | qu'elle cherche — et qu'elle patche le mauvais bloc |
| **Ce qui ne va pas** | l'ambiguïté sur l'intention |
| **Le contexte de l'amont** | qu'elle corrige dans le mauvais sens |
| **La correction, en code** | qu'elle réinvente une API qui ne collera pas au reste |
| **Le repro chiffré** | entrées → obtenu → attendu → écart. Sans écart, pas de priorité |
| **Comment vérifier** | le test à écrire, **avec sa contre-épreuve** |

**La contre-épreuve est le champ qu'on oublie.** « Le conjoint doit sortir à 0 € » se satisfait
en exonérant tout le monde. Le test qui compte est le second : « et un enfant doit toujours
sortir à 52 094 € ». Toute correction d'un cas particulier se double d'un test de
non-régression sur le cas général.

#### Cinq réflexes qui font gagner un tour entier
- **Mesurer, jamais estimer.** Copie ses libs *pures* dans le scratchpad, écris un probe Node,
  et mets dans le rapport **les nombres que sa branche produit vraiment**. Dis-le explicitement
  (« mesuré en exécutant ton code ») : c'est ce qui rend le repro incontestable. Ne fais jamais
  ça sur un script de `scripts/` — un import exécute le top-level.
- **Regrouper par cause racine.** Trois symptômes issus d'une même erreur de structure se
  corrigent avec **un seul bloc de code** donné une fois, référencé par les deux autres fiches.
  Trois correctifs séparés produisent trois patchs qui se marchent dessus.
- **Séparer ses défauts des nôtres.** Un refactor rend souvent visible un bug **préexistant sur
  `main`**. Ne le lui facture pas : dis que c'est à nous, demande-lui un **commentaire de doute
  dans le code**, et tranche de notre côté.
- **Ne jamais lui faire inventer une valeur.** Si on n'a pas la source, on demande un marqueur,
  pas une correction. Une correction plausible mais fausse est pire que le doute documenté. Et la
  source, **on la lit** (§5ter) : une règle extérieure recopiée d'un commentaire professionnel peut
  dire l'exact inverse du texte — c'est arrivé, sur un rapport prêt à partir.
- **Étiqueter ce qui est invisible depuis sa branche.** « Ça compile chez toi, ça casse au
  merge » : sans cette phrase, il conclut qu'on s'est trompés et ne corrige pas.

#### Contrôle anti-contamination avant envoi
Les deux documents partent chez un tiers. Un chemin `~/…`, un port de dev, un « cf. le banc » y
suffit à trahir un contexte qu'il n'a pas — et à le perdre. Sur **la page ET le `.md`** :
```bash
grep -nE "~/|/Users/|localhost|127\.0\.0\.1|:5[0-9]{3}|worktree" <les deux fichiers>  # doit être VIDE
```
(Mentionner le banc en une ligne de pied de page est légitime et même rassurant — « aucune base
réelle accessible, dossier fictif » — à condition de ne citer ni chemin ni port.)
Puis vérifier le rendu HTML (`md2page.mjs` ne prévient pas d'un markdown mal formé) : aucun
`**` ni backtick résiduel hors des blocs de code, une ancre par fiche, tables complètes.

Ne jamais envoyer sans l'accord du mainteneur : c'est un message sortant, vers un tiers.

### 9.4 Le critère de sortie, annoncé dès le premier tour
Sans critère écrit, la boucle ne se ferme jamais. Feu vert = les six à la fois :
- zéro `ouvert` en sévérité BLOQUANT ;
- **zéro assertion extérieure en `faux` ou jamais vérifiée** (§5ter), et les règles re-vérifiées à ce
  tour — un texte modifié entre deux tours périme silencieusement une correction déjà envoyée ;
- les IMPORTANT sont soit `corrigé`, soit `reporté` avec une raison acceptée par le mainteneur ;
- `npm run audit` vert sur la branche rebasée, **avec la liste de tests de `main`** (§4) ;
- `merge-tree` contre `main` ET contre les branches en attente : propre, ou conflits assumés ;
- le banc rejoué : les défauts prouvés à l'écran ne se reproduisent plus.

Puis on reprend le cycle normal à §3 (worktree de revue, merge, `npm run audit`, §8).

### 9.5 La langue : écrire pour quelqu'un qui n'a pas le dépôt ouvert

**Le défaut le plus coûteux d'une revue n'est pas d'avoir tort, c'est de n'être pas compris.**
Un rapport exact que le contributeur ne comprend pas produit exactement le même résultat qu'un
rapport faux : il ne corrige rien, ou il corrige à côté. Et il ne le dira pas — il répondra « ok,
je regarde », et le tour suivant repartira de zéro.

Le piège est structurel. Tu viens de passer des heures dans le dépôt : les identifiants, les noms
de scripts, les références du registre sont devenus pour toi des mots ordinaires. Ils ne le sont
pour personne d'autre. **Ce qui te paraît clair à la relecture est précisément le signal
d'alarme** : tu relis avec le contexte que le lecteur n'a pas.

#### Les sept règles

Chacune vient d'un rapport réellement envoyé et réellement mal reçu (cas réel, 11/08/2026).

**1. Jamais un identifiant nu comme sujet.** Le lecteur n'a pas le fichier sous les yeux. Nomme la
chose par ce qu'elle FAIT, et mets l'identifiant entre parenthèses derrière.
- ✗ « `anneeEpuisement` a changé de sens »
- ✓ « l'année qu'on affiche au client comme celle où son capital s'épuise (`anneeEpuisement`) ne
  désigne plus la même chose qu'avant »

**2. Un mot technique se définit dans la phrase où il apparaît — ou il disparaît.** Pas de note
en bas de page, pas de glossaire à la fin : le lecteur bute dessus au moment où il le lit.
- ✗ « zone morte temporelle », « TDZ » — ✓ « le code lit le dossier client avant de l'avoir créé »
- ✗ « le vendoring MCP est désynchronisé » — ✓ « ce fichier existe en double dans le dépôt : une
  copie sert au connecteur, et elle doit être régénérée quand l'original change »
- ✗ « `migrate()` est additif par spread » — ✓ « la migration ne fait qu'ajouter des champs vides,
  elle ne touche à rien de ce qui existe »

**3. Un sigle s'écrit en toutes lettres à sa première apparition, avec sa valeur si elle compte.**
Et un sigle qu'on n'explique pas, on le retire.
- ✗ « au-delà du PASS » — ✓ « au-delà du plafond annuel de la Sécurité sociale (48 060 € en 2026) »
- ✗ « il faut sourcer T1/T2, AGIRC-ARRCO, CEG/CET » — une liste de sigles jetée sans contexte
  n'apprend rien ; dire « les cotisations retraite se calculent par tranches, avec un taux
  différent au-dessus du plafond » suffit à faire comprendre POURQUOI le forfait est faux.

**4. Aucune référence qui exige un autre document.** Un renvoi que le lecteur ne peut pas résoudre
seul est une impasse, et il ne demandera pas.
- ✗ « les points B4, B5, I3 → I7 du premier tour restent ouverts »
- ✓ « les points sur la succession et l'assurance-vie du premier tour restent ouverts — je te
  redonnerai la liste quand ces PR arriveront »
- ✗ « le SCÉNARIO 16 de l'audit le contrôle » — c'est du vocabulaire interne au dépôt du
  mainteneur. ✓ « un contrôle automatique vérifie que ce numéro est le même à ces trois
  endroits ; il refuse le reste sinon ».

**5. Le défaut se raconte par ce que la personne VOIT, avant tout mot de code.** Puis la cause,
puis le correctif. Jamais l'inverse : une explication technique dont on ne sait pas quel symptôme
elle produit ne se hiérarchise pas.
- ✗ « `ReferenceError: Cannot access 'state' before initialization` au premier rendu »
- ✓ « en ouvrant l'application, on ne voyait plus qu'un message d'erreur rouge, sur tous les
  écrans et pour tous les clients. Rien d'autre ne s'affichait. »

**6. Une idée par phrase.** Pas de subordonnée imbriquée, pas de parenthèse dans une parenthèse.
Si une phrase a besoin d'un tiret ET de parenthèses, c'est deux phrases.

**7. Une référence légale vient APRÈS la règle en français, jamais à sa place.** L'article ne
justifie une affirmation que pour quelqu'un qui va l'ouvrir ; il ne l'explique à personne.
- ✗ « la part supérieure à 10 % du capital relève de L131-6 III CSS »
- ✓ « au-delà de 10 % du capital, les dividendes d'un gérant majoritaire ne sont plus traités
  comme du revenu du capital mais comme du revenu de travail : ils supportent des cotisations
  (art. L. 131-6 III du code de la Sécurité sociale) »

#### Ce que ces règles ne recouvrent PAS

Le `.md` de §9.3 s'adresse au contributeur **et à son assistant de code**. La précision de code y
reste indispensable : `fichier:ligne`, extrait fautif, correction en code. La règle n'est donc pas
« pas de code », c'est :

> **chaque fiche s'ouvre par deux ou trois phrases qu'un humain comprend sans rien ouvrir, puis
> descend dans le code.** Le lecteur humain s'arrête au premier paragraphe ; son IA lit la suite.

Le corps du **mail**, lui, n'a qu'un lecteur humain : il ne contient aucun identifiant, aucun nom
de fichier, aucun sigle non développé. Il dit ce qui s'est passé, ce qu'on a fait, et ce qu'on
attend — et il renvoie à la pièce jointe pour tout le reste.

#### Le contrôle avant envoi

Deux gestes, dans cet ordre :

```bash
# 1. Les mots qui trahissent un contexte que le lecteur n'a pas (à relire un par un,
#    pas à supprimer aveuglément : certains sont légitimes s'ils sont expliqués sur place)
grep -noE "TDZ|spread|memo|vendoring|hoist|refactor|\bSCÉNARIO [0-9]+|\bPASS\b|\b[A-Z]{2,}-[A-Z]{2,}\b" <le document>
# 2. Les renvois internes au registre, qui n'existent que chez le mainteneur
grep -noE "\b[BIMNAP][0-9]+\b" <le document>
```

Puis **le test qui tranche** : demande à un sous-agent qui n'a pas suivi la session de résumer, à
partir du seul document, ce qui s'est passé et ce qu'on attend du contributeur. S'il se trompe ou
s'il reste vague, c'est le document qui est en cause, pas lui. C'est le seul contrôle honnête —
toi, tu ne peux plus lire ce texte sans le contexte que tu as en tête.
