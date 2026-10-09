# autoCLIpassword — post-mortem de diagnostic

Ces leçons servent **APRÈS un échec**, pas avant d'écrire une commande. Les interdits qui
s'appliquent au moment où tu tapes (ssh/stdin, `sudo -S`, `--passwordenv`, jamais `get` ni
`--help`, NFC/NFD, destination qui n'étoile pas) restent dans `SKILL.md` : hors du fichier
toujours lu, ils ne protègeraient plus rien.

Ouvre ce fichier quand une commande à secret a échoué et que tu t'apprêtes à conclure — surtout
si la conclusion tentante est « la passphrase est mauvaise, je rouvre une fenêtre ».

## Sommaire

- [Pourquoi l'utilisateur est re-sollicité alors que le secret est en RAM (08/08/2026)](#pourquoi-lutilisateur-est-re-sollicit-alors-que-le-secret-est-en-ram-08082026)
- [Un `set` réussi ne prouve RIEN : sonde `has` après avoir seedé (10/08/2026)](#un-set-russi-ne-prouve-rien--sonde-has-aprs-avoir-seed-10082026)
- [Un 403 d'API n'est pas une preuve de secret invalide — lis le CORPS (30/08/2026)](#un-403-dapi-nest-pas-une-preuve-de-secret-invalide--lis-le-corps-30082026)
- [Ranger au coffre une valeur DÉJÀ en RAM : `--value-cache-key` (04/09/2026)](#ranger-au-coffre-une-valeur-dj-en-ram----value-cache-key-04092026)
- [`bw get item` appelé EN RAFALE répond VIDE par intermittence (05/09/2026)](#bw-get-item-appel-en-rafale-rpond-vide-par-intermittence-05092026)
- [La saisie est à l'aveugle → les fautes de frappe arrivent](#la-saisie-est--laveugle--les-fautes-de-frappe-arrivent)
- [Une fenêtre ouverte sur un secret DÉJÀ en RAM est un défaut (08/09/2026)](#une-fentre-ouverte-sur-un-secret-dj-en-ram-est-un-dfaut-08092026)

## Pourquoi l'utilisateur est re-sollicité alors que le secret est en RAM (08/08/2026)

**Symptôme, dit par l'utilisateur** : « je mets 24 h et tu me redemandes quand même — soit ce n'est pas
vraiment en RAM, soit tu ne vérifies pas ». Les deux hypothèses étaient fausses, et la vraie cause
est pire : **le mécanisme marchait, mais on le contournait presque une fois sur deux.**

**Mesure** (extraction des invocations réelles dans les transcriptions `~/.claude/projects`) :

| 3ᵉ argument passé à `ask-secret.sh` | invocations | effet |
|---|---:|---|
| **aucune clé** (2 arguments) | **359** | fenêtre à chaque fois, **et rien n'est mémorisé** |
| `app-vault` | 328 | cache utilisable |
| `bw-master` | 102 | cache utilisable |
| `vps-sudo` / `vps` / `ssh-key` / `ssh-vps` | 9 / 6 / 3 / 1 | **4 noms pour 2 secrets** → aucun partage |

**Causes racines, par ordre de poids :**
1. **Clé de cache omise (44 % des appels).** Sans 3ᵉ argument, `ask-secret.sh` ne consulte même pas
   le cache et ne stocke rien : la saisie de 9 h 05 ne sert pas à celle de 9 h 07.
2. **Dérive des noms de clés.** `vps` ≠ `vps-sudo` ≠ `ssh-key` : le secret était bien en RAM, sous
   un autre nom, donc invisible.
3. **Le sélecteur de durée était sur « Aucune » par défaut**, et la touche Entrée valide OK sans
   toucher au menu → saisie correcte, mémorisation nulle, sans que rien ne le signale.
4. **Aucune sonde lisible.** `get` est la seule façon de savoir si une clé est là — or `get`
   **imprime le secret** (incident 06/08). Donc « vérifier avant de demander » n'était pas outillé.

**Corrigé le 08/08 :** défaut du menu = 24 h quand une clé est fournie · avertissement stderr quand
la clé manque · témoin stderr `cache RAM HIT` quand aucune fenêtre ne s'ouvre · nouvelles
sous-commandes `has` et `keys`.

**5ᵉ cause, trouvée le 09/08 — la clé se perdait dans un script INTERMÉDIAIRE.** `bw-unlock.mjs`,
`bw-get.mjs` et `vault-connect.mjs` (dépôt de l'outillage coffre) appelaient `ask-secret.sh` avec
**deux arguments**. Symptôme à reconnaître : **deux fenêtres dans une seule commande** — la mienne
(avec `bw-master`, qui mémorise), puis celle du script (sans clé, qui ne lit pas ce que je viens de
mémoriser), séparées de ~20 s. Sonder `has` avant ne protège de rien dans ce cas : la sonde répond
HIT et la fenêtre s'ouvre quand même. Corrigé : les trois passent `bw-master`. Corrigé aussi, le
filet d'extinction de `secret-agent.mjs` partait du démarrage du daemon, donc un secret confié tard
mourait avant son TTL — il part désormais de la dernière échéance connue.

⚠️ **Tout script qui appelle `ask-secret.sh` doit passer la clé en 3ᵉ argument.** Avant d'écrire un
nouvel appelant : `grep -rn "ASK, prompt, title\]" ` sur le dépôt. Et si l'avertissement
« AUCUNE clé de cache » apparaît dans une sortie où TU as pourtant passé la clé, c'est qu'un script
appelé en aval en ouvre une seconde : va corriger CE script, pas ta commande.

## Un `set` réussi ne prouve RIEN : sonde `has` après avoir seedé (10/08/2026)

**Symptôme** : `mcp-server/bin/seed-secrets.sh` annonce « ✓ Secrets MCP chargés en RAM », et le MCP
l'app répond dans la minute « Mot de passe introuvable ».

**Cause racine, en deux étages.** (1) `bw get password "<nom>"` fait une recherche **floue** : un nom
qui matche plusieurs items (séparateur « · » commun, doublon « … — RÉVOQUÉ ») échoue, `2>/dev/null`
avale l'erreur, et le pipe pousse une **chaîne vide**. (2) `secret-agent.mjs set` ignore un payload
vide **en silence** (`if (ttl > 0 && payload)`) et sort en 0 — donc le pipe réussit, et le script
imprime son « ✓ ». Le trou est structurel : **`set` ne peut pas échouer**, il n'y a aucun retour.

**Règles actionnables** — pour tout script qui seede l'agent depuis un coffre :
- **Résous l'item par son `id`**, jamais par son nom : `bw list items --search <terme simple>`, filtre
  le nom **exact** normalisé **NFC** (cf. [[pitfall-osascript-nfd-bitwarden]]), refuse 0 ou ≥2
  candidats — puis `bw get password <id>`.
- **Déclare la SOURCE de la valeur par item** (`password`, ou champ custom nommé). **Jamais de repli
  sur `notes`** : les items de l'utilisateur y portent un mode d'emploi en prose. Un repli sur `notes` charge
  du texte **non vide**, donc accepté par l'agent — l'erreur ne se voit alors qu'au premier appel
  distant (`invalid_client`), bien plus tard et bien plus loin. Vécu le 10/08 : 216 caractères de
  prose chargés comme client secret Google. Un secret d'env n'est jamais multi-lignes : refuse-le.
- **Vérifie APRÈS coup avec `has`** (jamais `get`, cf. 06/08) pour CHAQUE clé attendue, et ne
  n'imprime le « ✓ » final que si toutes répondent HIT. Sinon : `exit 1` et message par clé.

Généralisation : **n'annonce jamais « c'est chargé » sur la foi du code de retour d'un `set`.** La
seule preuve est une sonde de présence indépendante.

## Un 403 d'API n'est pas une preuve de secret invalide — lis le CORPS (30/08/2026)

**Symptôme** : trois jetons Supabase sortis du coffre rendent tous `403` sur
`api.supabase.com/v1/projects`. Conclusion tentante, et fausse : « ils sont révoqués ». Le
réflexe suivant aurait été de `drop` la clé du cache et de rouvrir une fenêtre — pour un
secret parfaitement valide.

**Cause racine** : `urllib.request` envoie `User-Agent: Python-urllib/3.x`, que l'API refuse
en amont de toute authentification. Le même jeton, avec `User-Agent: curl/8`, répond 200.
`urlopen` ne montre que le code : le corps de la réponse, qui disait la vraie raison, n'avait
jamais été lu.

**Règles actionnables :**
- **Ne juge JAMAIS un secret sur un code de retour seul.** Lis le corps
  (`except HTTPError as e: e.read()`) avant de conclure quoi que ce soit.
- **401 ≠ 403.** 401 met en cause l'identifiant ; 403 met en cause le droit, l'en-tête ou le
  périmètre — donc presque jamais la saisie.
- **Pose un `User-Agent` réaliste** sur tout appel d'API depuis un script Python : plusieurs
  fournisseurs filtrent l'UA par défaut.
- C'est la même règle que « Anti-typo, mais ciblé » vue d'un autre côté : **un échec en aval
  ne purge pas le cache.** Ici, purger aurait re-demandé une passphrase déjà bonne, et le
  vrai défaut (deux en-têtes) serait resté entier.

⚠️ Corollaire de périmètre, appris le même jour : un jeton peut être **valide et sans droit
sur la cible**. Le PAT de gestion Supabase de l'utilisateur ne couvre que les projets de SON organisation ;
un projet d'un autre compte reste hors de portée, quel que soit le nombre de fenêtres ouvertes.
Avant d'insister, vérifie que la cible est bien dans le périmètre du secret — sinon la bonne
réponse n'est pas un autre secret, c'est un autre chemin. Cf.
[[p-supabase-projet-hors]].

## Ranger au coffre une valeur DÉJÀ en RAM : `--value-cache-key` (04/09/2026)

**Symptôme** : après avoir posé un nouveau mot de passe sudo VPS (saisi une fois, prouvé par
`sudo -S`), `vault-add.mjs` rouvrait une fenêtre pour la **même** valeur — à retaper à l'aveugle.
Une typo là ne se serait vue nulle part : le coffre aurait porté une valeur FAUSSE et personne ne
l'aurait su avant le prochain besoin.

**Cause racine** : `vault-add.mjs` appelait `ask(...)` **sans clé de cache** pour la valeur à
stocker — le cas « le secret vient d'être saisi dans cette même session » n'était pas prévu.

**Corrigé** : `vault-add.mjs` accepte `--value-cache-key <clé>` ; sur HIT, aucune fenêtre, et la
valeur rangée est **exactement** celle qui a été exercée.

```bash
node vault-add.mjs --type login --name "…" --username leo --value-cache-key vps-sudo
```

**Règle actionnable — ne fais jamais retaper une valeur que tu viens de faire saisir.** Si tu as
posé un secret quelque part dans cette session, il est sous une clé de l'agent : passe-la.
Et **avant de reposer** un secret : cherche-le au coffre et compare sa **date de révision** à la
date du fait (pour un mot de passe UNIX : le 3ᵉ champ de `/etc/shadow`) — la valeur juste y est
peut-être déjà. Voir [[p-sudo-refuse-mdp-date-shadow]].

## `bw get item` appelé EN RAFALE répond VIDE par intermittence (05/09/2026)

**Symptôme** : une migration de base qui enchaîne ~40 requêtes SQL, chacune lisant son jeton
au coffre via `bw get item`, s'arrête sur un `json.decoder.JSONDecodeError: Expecting value:
line 1 column 1`. La trace pointe le parseur JSON — **300 lignes après la vraie cause**. Un
appel isolé au même item, à la même seconde, réussit. Vu aussi : `bw get item` qui reste
plusieurs dizaines de secondes puis dépasse le délai de l'outil.

**Cause racine** : `bw` est stateful (il relit et réécrit son `data.json`). Appelé en rafale,
il rend une sortie vide sans code d'erreur exploitable. Deux fautes de conception s'ajoutent :
(1) **un appel au coffre par requête** au lieu d'un seul au démarrage ; (2) **aucun garde**
sur la sortie vide, donc l'échec voyage sous un déguisement.

**Règles actionnables** :
- **Un flux qui rappelle un secret N fois le charge UNE fois dans l'agent RAM**, puis lit
  l'agent. C'est le cas d'usage même de l'agent : `bw` ne doit apparaître qu'au *seeding*.
- **Tout lecteur de coffre refuse bruyamment une sortie vide** : `[ -n "$J" ] || { echo
  "coffre MUET : session expirée ou item introuvable ($1)" >&2; exit 4; }`. Sans ce garde,
  un coffre muet se déguise en JSON illisible, très loin de sa cause.
- Ne pas conclure « la session a expiré » sur un seul échec : sonder d'abord
  `BW_SESSION=… bw status` (il dit `locked` / `unlocked`), et n'ouvrir la fenêtre que si le
  statut le confirme. Cf. la règle « anti-typo, mais ciblé ».
- ⚠️ `timeout` **n'existe pas sur macOS** : `timeout 60 bw …` rend `command not found`, soit
  37 caractères d'erreur qu'on prend pour une réponse du coffre. Utiliser un vrai
  chronométrage (`time`), ou `gtimeout` si coreutils est installé.

## La saisie est à l'aveugle → les fautes de frappe arrivent

Le champ est masqué : l'utilisateur peut se tromper sans le voir. Si une étape échoue (« passphrase invalide / coffre indéchiffrable »), **ne conclus rien avant de VÉRIFIER l'empreinte** : compare le kid de la saisie à la clé canonique (`keycheck verify`, ou `keyIdOf(pass)`). Deux cas nettement distincts :

- **kid ne concorde PAS** → vraie mauvaise saisie (typo, ou mauvaise passphrase). Là, re-propose la fenêtre (et `drop` le cache d'abord).
- **kid concorde mais l'étape échoue quand même** → la passphrase est BONNE ; **arrête de re-demander**. Le problème est en aval (coffre corrompu, kid périmé vs ct, transfert tronqué, bug de script). Débogue ça, garde le cache. Re-prompter en boucle ne fera que répéter le même échec avec la bonne passphrase (incident app-vault 16/07 : 5+ saisies inutiles d'une passphrase parfaitement correcte).

⚠️ Un kid qui concorde prouve que la passphrase est la bonne, **pas** que le ct s'ouvre (`keycheck verify` ne déchiffre pas). Pour trancher « le coffre lui-même est-il ouvrable ? », il faut un **vrai déchiffrement** (ex. `vault-open.mjs` côté app-vault), pas le kid.

## Une fenêtre ouverte sur un secret DÉJÀ en RAM est un défaut (08/09/2026)

**Symptôme, dit par l'utilisateur** : « tu n'as pas le droit de commencer à écrire ton code pour me
présenter la fenêtre cachée tant que tu n'as pas vérifié si tu avais déjà le mot de passe en
mémoire RAM — c'est une condition stricte ».

**Cause racine, structurelle** : la règle existait déjà (« Sonder, jamais deviner »), mais elle
était enterrée en `###`, à ~140 lignes du début, dans une sous-section d'une section d'exception —
tandis que le **patron de commande prêt à copier** était juste en dessous. Rien ne la rendait
**bloquante**. Une règle qui n'est pas une porte est un vœu : cf. [[p-lecon-vit-au-goulot]] — une
leçon écrite n'est pas tenue, elle vit au GOULOT.

**Mesure du jour** (`keys`, valeurs jamais sorties) : 4 secrets étaient en RAM, avec 16 à 24 h de
TTL restant. **Deux n'étaient pas au registre canonique** — dont la clé la plus passée du poste
(1 476 occurrences, contre 349 pour la première du tableau). Un `has` sur le nom que le registre
donnait en tête aurait donc répondu `MISS` sur une machine qui portait déjà quatre secrets, et
ouvert une fenêtre inutile. **C'est pourquoi le Geste 0 est `keys`, pas `has`.**

**Corrigé** : la sonde devient le Geste 0, en tête de fichier, avant tout patron de commande ·
registre complété par les deux clés manquantes et déplacé dans `references/registre-cles.md`
(privé), avec la mention que `keys` fait foi, pas le tableau · le déclencheur est inscrit dans la `description` du frontmatter, donc lu avant même
d'ouvrir le corps du skill.
