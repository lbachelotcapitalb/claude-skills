---
name: autocli-password
description: >-
  Run a terminal command that needs a secret only the user knows by collecting it through a
  native hidden-input dialog piped straight into the command — never asking the user to paste it.
  Use when a command would otherwise block on a credential: deploying or rebuilding an encrypted
  artifact, decrypting a vault, logging into a CLI, an SSH key passphrase, or a `sudo` step. The
  secret stays in RAM for one command and is never written to disk or history. Déclenche AUSSI sur
  le symptôme, sans qu'on te le demande : « coffre verrouillé », « BW_SESSION absent », « mot de
  passe introuvable », un serveur MCP qui refuse faute d'identifiant, `bw status` = `locked`,
  `Permission denied (publickey)`. Un secret verrouillé n'est jamais un « non mesuré » : ouvre la
  fenêtre masquée, seed la clé, rejoue l'appel. GESTE 0 BLOQUANT, avant d'écrire la moindre ligne
  de commande : `secret-agent.mjs keys` — le secret est peut-être déjà en RAM. Ouvrir une fenêtre
  sur un secret déjà mémorisé est un défaut, pas une précaution.
---

# autoCLIpassword — exécution autonome de commandes à secret

## L'idée

Quand une commande a besoin d'un secret que **seul l'utilisateur connaît**, le réflexe habituel est mauvais : soit on lui demande de coller le secret (il transite par le chat / l'historique), soit on lui tend un bloc avec un placeholder `…` à éditer à la main, soit on le code en dur. Tout ça crée de la friction et expose le secret.

À la place : **c'est toi (Claude) qui lances la commande**. Au moment où elle a besoin du secret, une **fenêtre native à champ masqué** s'ouvre sur l'écran de l'utilisateur. Il tape, valide, et la valeur part directement dans l'environnement de la commande. Tu lis la sortie et tu enchaînes. L'utilisateur **n'a qu'un geste : taper son mot de passe**. Il ne colle rien.

Pourquoi c'est mieux : le secret n'apparaît jamais dans la conversation, jamais dans `history`, jamais sur disque. Il n'existe que dans la RAM, le temps d'une commande.

## ⛔ Geste 0 — SONDER la RAM avant d'écrire la moindre ligne (bloquant)

**Tu n'as pas le droit d'écrire une commande contenant `ask-secret.sh` avant d'avoir lancé, dans
cette session, la sonde qui liste ce qui est déjà en RAM.** Ce n'est pas un conseil de prudence,
c'est une **condition d'entrée** dans le skill, posée par l'utilisateur le 08/09/2026.

```bash
node ~/.claude/skills/autocli-password/scripts/secret-agent.mjs keys
```

`keys` rend une clé et son TTL restant par ligne — **jamais une valeur** — et ne rend rien si
l'agent est éteint. Trois issues, une seule ouvre une fenêtre :

| Sortie de `keys` | Ce que tu fais |
|---|---|
| la clé visée est listée | passe-la en 3ᵉ argument → `cache RAM HIT`, **zéro fenêtre, zéro geste** |
| des clés, mais pas la tienne | vérifie qu'aucune ne DÉSIGNE le même secret sous un autre nom, puis fenêtre |
| rien / agent éteint | fenêtre, avec la clé canonique du registre |

**`keys`, pas `has`.** `has <clé>` ne répond que sur le nom que tu as **deviné** : si le secret dort
sous un autre nom, il répond `MISS` et tu ouvres une fenêtre pour rien — exactement la « dérive des
noms de clés » mesurée le 08/08. `keys` montre le stock entier, donc il ne peut pas te cacher un
secret déjà là. Ne descends à `has` qu'après avoir vu le stock.

**Ne dis jamais « il me faut ton mot de passe » ni « le secret est en RAM » avant cette sonde.**
Une fenêtre ouverte sur un secret déjà mémorisé est un **défaut**, pas une précaution.

## Boucle d'apprentissage — ce skill capitalise, il ne se répète pas

**Règle permanente : dès que tu rencontres une friction ou un incident avec ce mécanisme et que tu le résous, tu INSCRIS la leçon ici avant de clore.** Une saisie qui bloque, une passphrase re-demandée pour rien, un cache mal purgé, un dialogue qui timeout, un piège d'outillage en aval : chacun est un apprentissage à graver, pas à revivre. Le but est qu'une deuxième occurrence du même problème soit impossible — parce que la règle qui l'évite est déjà dans ce fichier.

Comment graver, à chaque fois :
1. **Symptôme → cause racine → règle** en une ou deux phrases, datée, ajoutée à la section pertinente (souvent « Anti-typo, mais ciblé » ou une nouvelle puce). Formule la règle de façon *actionnable* (« ne fais pas X quand Y », pas « attention à X »).
2. Si la cause touche un système précis (app-vault, Bitwarden…), pose aussi le détail dans la mémoire-pièges de ce système (`[[pitfalls-<systeme>]]`, etc.) et lie-la ici.
3. Si un petit outil de contrôle a manqué (un test lecture-seule, un validateur), crée-le et référence-le, pour que la prochaine fois le diagnostic soit une commande, pas une enquête.

**Avant de reprompter ou de conclure « ça ne marche pas », relis d'abord les leçons déjà gravées ici** : la réponse à ta friction du jour y est peut-être déjà. Chaque incident bien capitalisé rend ce skill strictement plus fiable que la veille — c'est le seul état acceptable.

*(Incident fondateur, 16/07/2026 : passphrase app-vault correcte re-demandée 5+ fois parce que la doctrine purgeait le cache sur un échec en aval — alors que le kid concordait. Cause réelle : coffre au kid périmé vs ct. Règle gravée → section « Anti-typo, mais ciblé ». C'est précisément ce que cette boucle doit rendre non-répétable.)*

## La règle d'or (sécurité)

Un secret maître (passphrase qui déchiffre un coffre, clé qui ouvre toute une infra) **ne doit JAMAIS être persisté**. La raison : tout ce qui est stocké est volable — par un process tournant sous la session déverrouillée de l'utilisateur, ou par quelqu'un devant sa machine déverrouillée. Gardé seulement dans sa tête + transitoirement en RAM, il n'y a rien à voler.

Concrètement, à chaque usage :
- Capture le secret par **substitution de commande** (`$(...)`) dans une variable d'env, pour **une seule** commande.
- `unset` la variable juste après.
- N'écris JAMAIS le secret dans un fichier, un log, ou un argument en clair (`--passphrase 'xxx'` finit dans `history` et dans la table des process — préfère toujours une **variable d'environnement** que l'outil lit).
- Ne le ré-affiche jamais (pas d'`echo "$SECRET"`).
- **Refuse le DISQUE** pour un secret maître : jamais Keychain, jamais un champ Bitwarden, jamais `.env`. Tout ce qui touche le disque est volable et survit au redémarrage.

## Exception bornée et autorisée : mémorisation en RAM (modèle ssh-agent)

L'utilisateur a explicitement validé (25/06) une **commodité opt-in** : éviter de retaper la même passphrase
à chaque fenêtre, **sans jamais toucher le disque**. C'est le modèle `ssh-agent`/`gpg-agent`, pas
un store sur disque — donc compatible avec la règle d'or ci-dessus (l'interdit, c'est le disque).

`scripts/secret-agent.mjs` est un daemon **éphémère, RAM uniquement** : il garde des secrets
(clé → valeur) derrière une socket Unix `0600`, chaque entrée avec un **TTL plafonné à 24 h**, et
**s'éteint tout seul** dès que tout est expiré (et au plus tard à 24 h 05). Le secret ne vit que
dans le tas de ce process ; le seul fichier sur disque est la socket (0 octet de secret).

Quand une clé de cache est fournie (macOS), la saisie tient dans **UNE seule fenêtre** : une
`NSAlert` Cocoa (pont AppleScript-ObjC, zéro dépendance) avec un champ masqué **et** le menu de
durée côte à côte. Si la NSAlert échoue (vieux macOS), repli automatique sur l'ancien flux à deux
fenêtres (`display dialog` puis `choose from list`). Sans clé de cache : une seule fenêtre masquée
classique, comme avant.

Garde-fous non négociables :
- **Défaut = 24 h dès qu'une clé de cache est fournie** (changé le 08/08/2026, voir la section
  « Pourquoi l'utilisateur est re-sollicité »). Le menu s'ouvre sur « 24 heures » ; l'utilisateur peut redescendre ou
  choisir « Aucune ». Sans 3ᵉ argument, `ask-secret.sh` ne mémorise rien **et le dit sur stderr** —
  ce n'est pas un mode normal, c'est le signe que tu as oublié la clé.
- **Plafond 24 h, en dur**, dans le daemon (impossible de demander plus). Ladder : 5 min → 24 h.
  L'exposition d'un secret maître en RAM toute la journée est réelle — mais l'utilisateur a tranché (08/08) :
  il préfère ce risque, borné et sans disque, à des dizaines de fenêtres par jour. Le geste de
  réduction, c'est le **flush** quand il s'éloigne, pas une durée courte par défaut.
- **RAM seulement** : aucune écriture disque du secret, jamais.
- **Périmètre** : seulement les secrets maîtres réutilisables — voir le **registre des clés
  canoniques** ci-dessous. Pas les valeurs jetables (un mot de passe qu'on dépose une fois ne se met
  pas en cache).
- **Bouton panique** : `node ~/.claude/skills/autocli-password/scripts/secret-agent.mjs flush`
  oublie tout immédiatement (et éteint le daemon). À proposer si l'utilisateur s'éloigne de sa machine.
- **Anti-typo, mais ciblé** (leçon 16/07/2026) : ne `drop`/reprompte QUE sur une **preuve positive
  de mauvaise saisie** — une empreinte de clé qui **ne concorde pas** (`keycheck verify` → kid ≠
  canonique, unlock explicitement « clé invalide »). Un simple **échec en aval** (rebuild raté,
  « coffre indéchiffrable », deploy KO) alors que **le kid CONCORDE** signifie que la passphrase est
  BONNE et que le problème est ailleurs (coffre corrompu, kid périmé vs ct, bug d'outillage) →
  **GARDE le cache, n'ennuie pas l'utilisateur, débogue la cause.** Purger la clé sur ce genre
  d'échec = re-demander en boucle une passphrase déjà correcte (exactement ce qui s'est passé le
  16/07 : coffre chiffré de l'app au kid valide mais ct inouvrable — la passphrase n'a jamais été en cause).
  ⚠️ `keycheck verify` **ne déchiffre pas** (compare seulement le kid) : un kid qui concorde ne
  prouve pas que le ct s'ouvre. `vault-add.mjs` drope déjà sur mismatch pour `bw-master`/`app-vault`.
- **Cache par défaut pour un flux multi-étapes** : dès qu'une session va rappeler le même secret
  maître plusieurs fois (récup + rebuild + deploy…), fournis la **clé de cache** et suggère une
  durée dès la 1ʳᵉ fenêtre → UNE seule saisie pour toute la séquence, au lieu de N fenêtres.

## ⛔ Un secret TAPÉ dans la fenêtre se RANGE au coffre — passage strict (20/09/2026)

**Symptôme** : l'utilisateur crée un jeton d'API, le tape dans la fenêtre masquée, et le considère comme
**enregistré**. Deux heures plus tard, on le cherche dans Bitwarden : il n'y est pas. Il a vécu
en RAM, il mourra avec le TTL, et il faudra le recréer — un jeton de plus dans le dashboard,
sans expiration, que personne ne révoquera.

**Cause racine** : ce skill était écrit pour la SAISIE (ne pas faire transiter un secret par le
chat) et s'arrêtait là. Rien n'y disait où le secret doit VIVRE ensuite. La RAM est un cache,
pas un rangement : elle n'a ni inventaire, ni note de portée, ni date de révocation.

**Règle, sans exception** : dès qu'une valeur tapée dans la fenêtre est **durable et
réutilisable** — jeton d'API, clé de service, mot de passe d'un compte tiers —, elle est
**créée dans le coffre DANS LE MÊME TOUR**, avant d'être utilisée pour autre chose. On ne
demande pas la permission : ranger un secret est le geste attendu, pas une option.

Ce qui reste en RAM SEULEMENT, et n'a rien à faire au coffre : les secrets **maîtres**
(passphrase Bitwarden, passphrase d'un coffre applicatif — règle d'or ci-dessus), et les
valeurs **jetables** (un code à usage unique, un OTP).

**Comment ranger dans le bon coffre** — `vault-add.mjs` vise le coffre PERSO et ne sait pas
réutiliser une valeur déjà en RAM. Pour le coffre **commun French Mac**, créer l'entrée
directement, la valeur prise dans l'agent (donc jamais retapée) et le JSON passé **sur stdin**
(jamais en argv : `bw create item <base64>` exposerait le secret dans `ps`) :

```bash
export BITWARDENCLI_APPDATA_DIR=~/.bw-<second-coffre>   # sinon c'est le coffre par défaut
SESSION="$(node ~/Documents/Claude/Projects/cartographie-it/bw-unlock.mjs --print-session)"
VAL="$(~/.claude/skills/autocli-password/scripts/ask-secret.sh "…" "…" <clé-RAM>)"   # cache HIT
VAL="$VAL" python3 -c '…json…' | bw create item --session "$SESSION"   # base64 sur STDIN
```

**La note de l'entrée porte ce que la valeur ne dit pas** : quel COMPTE (ici
`contact@example.com`, pas le compte perso), quelle PORTÉE exacte, s'il y a une EXPIRATION, et où
le révoquer. Un jeton sans portée écrite est un jeton que personne n'osera supprimer.

## Registre des clés canoniques — n'en invente jamais une nouvelle

Un secret maître réutilisable a **une seule** clé de cache, stable, réutilisée partout. Deux noms
pour le même secret (`vps` ≠ `vps-sudo` ≠ `ssh-key`) = un cache qui ne se partage pas = une fenêtre
de plus à chaque fois — c'est la « dérive des noms » mesurée le 08/08.

**La règle est donc : ne nomme rien, retrouve.** Dans l'ordre —

1. `secret-agent.mjs keys` (Geste 0) : le secret est peut-être déjà là, sous un nom que tu n'aurais
   pas deviné.
2. `grep -rIn "ask-secret.sh" ~/.claude ~/.config` : le nom que les scripts passent DÉJÀ fait foi.
3. Le registre de ce poste — `references/registre-cles.md` — qui documente les clés en service.
   Il est **privé** (hors vitrine publique) : il nomme une infrastructure.

Une clé nouvelle ne s'introduit qu'après ces trois passes, et seulement si aucune n'existe pour ce
secret. **Le tableau ne fait jamais autorité contre `keys`** : il a été mesuré incomplet le
08/09/2026, sur le secret le plus utilisé du poste.

## Le réflexe, dans cet ordre

1. **Sonder, jamais deviner** — c'est le **Geste 0 bloquant** en tête de ce fichier :
   `node "$SKILL/scripts/secret-agent.mjs" keys` liste TOUTES les clés en mémoire avec leur TTL
   restant (jamais les valeurs). `has <clé>` → `HIT <ttl>s` (exit 0) / `MISS` (exit 3) ne vient
   qu'APRÈS, pour confirmer un nom précis : seul il te cache les secrets rangés sous un autre nom.
2. **Toujours passer la clé de cache**, même pour un appel unique — un appel unique le reste
   rarement, et sans clé la saisie est perdue pour la suite de la session.
3. **Ne jamais annoncer « le secret est en RAM »** sans avoir lancé `has` : c'est exactement
   l'affirmation non mesurée que l'utilisateur a prise en défaut.

⛔ **N'utilise JAMAIS `get` pour tester une présence** : il écrit le secret sur stdout, donc dans la
transcription. `has` existe pour ça.

## Comment lancer une commande (helper fourni)

Utilise le helper `scripts/ask-secret.sh` — il affiche la bonne fenêtre selon l'OS (macOS `osascript`, Linux `zenity`/`systemd-ask-password`, repli terminal `read -rs`) et imprime le secret saisi sur stdout. Annulation ou saisie vide → il sort en erreur, donc la commande appelante avorte proprement (rien ne se passe).

Patron général (le `&&` garantit que rien ne tourne si l'utilisateur annule). **Le 3ᵉ argument — la
clé de cache — fait partie du patron : ne le retire que pour un secret authentiquement jetable.**

```bash
SKILL=~/.claude/skills/autocli-password
node "$SKILL/scripts/secret-agent.mjs" has <clé>   # HIT/MISS, sans jamais sortir la valeur
SECRET="$("$SKILL/scripts/ask-secret.sh" "Motif clair de la demande" "Titre fenêtre" <clé>)" \
  && VAR_ATTENDUE_PAR_L_OUTIL="$SECRET" <commande qui lit cette variable> \
  ; unset SECRET
```

Sur un HIT, `ask-secret.sh` n'ouvre **aucune** fenêtre et écrit `cache RAM HIT` sur stderr : ce
témoin dans ta sortie d'outil est la preuve que l'utilisateur n'a rien eu à taper.

**3ᵉ argument optionnel = clé de cache RAM** (voir l'exception bornée ci-dessus). Fournis-le
seulement pour un secret maître réutilisable, avec une clé stable (`app-vault`, `bw-master`) :

```bash
# 1ʳᵉ fois : fenêtre masquée + sélecteur de durée. Cache HIT ensuite → aucune fenêtre.
SECRET="$("$SKILL/scripts/ask-secret.sh" "Passphrase du coffre app (rebuild chiffré)" "app-vault · rebuild" app-vault)" \
  && APP_VAULT_PASS="$SECRET" node app-sync.mjs rebuild ; unset SECRET APP_VAULT_PASS
```

Réutilise la **même clé** pour le même secret partout (sinon le cache ne se partage pas). Si la
commande échoue sur un secret invalide, oublie-le avant de retenter :
`node "$SKILL/scripts/secret-agent.mjs" drop app-vault`.

**Exemple réel — rebuild + deploy d'un coffre chiffré (app-vault) :**

```bash
SKILL=~/.claude/skills/autocli-password
cd ~/Documents/Claude/Projects/cartographie-it \
  && APP_VAULT_PASS="$("$SKILL/scripts/ask-secret.sh" "Passphrase du coffre app (rebuild chiffré)" "app-vault · rebuild")" \
       node app-sync.mjs rebuild \
  ; unset APP_VAULT_PASS
# puis (sans secret) :
./deploy-app-vault.sh
```

Donne à l'outil Bash un **timeout généreux** (≈ 180 s) sur la commande qui ouvre la fenêtre : il attend pendant que l'utilisateur tape.

## Avant de prompter : le secret a-t-il déjà un agent/cache natif ?

Leçon (22/07/2026) : passphrase SSH VPS re-demandée en fenêtre alors qu'elle est **déjà dans le
Keychain macOS** (posée là par l'utilisateur, cf. mémoire GTMAdvisory 16/07). Règle actionnable — pour une
**clé SSH**, avant toute fenêtre : `ssh-add --apple-load-keychain` (recharge sans rien demander),
et seulement si ça ne charge rien → fenêtre masquée puis `ssh-add --apple-use-keychain` (le
Keychain est l'exception validée pour CETTE passphrase ; la doctrine « jamais sur disque » vaut
pour les coffres app-vault/Bitwarden, pas pour ce cas déjà acté). Généralisation : si le secret vise
un outil qui a son propre agent/cache (ssh-agent, gpg-agent, keychain), vérifie d'abord que
l'agent n'est pas simplement vide — un agent vidé par un redémarrage n'est pas un secret perdu.

**Affûtage (25/07/2026) — le déclencheur est le SYMPTÔME, pas la lecture de ce skill.** La règle
ci-dessus n'a pas servi le 25/07 : `ssh root@VPS` a renvoyé `Permission denied (publickey)`, ç'a été
lu comme un **refus de permission**, annoncé à l'utilisateur (« je n'ai pas pu sonder ») et la réponse a été
bâtie sur la **documentation** au lieu de l'état réel — qui contenait 4 crons de plus et une heure
fausse. `ssh-add --apple-load-keychain` a suffi ensuite : la clé était dans le Keychain, l'agent
était juste vide. **Règle actionnable : `Permission denied (publickey)` sur une machine de l'utilisateur n'est
JAMAIS un refus d'accès ni une raison de se replier sur la doc.** Enchaîner immédiatement, sans
demander : `ssh-add -l` → `ssh-add --apple-load-keychain` → (si vide) fenêtre masquée +
`ssh-add --apple-use-keychain`. Ne remonter le problème à l'utilisateur qu'après les trois. Cf.
[[f-coffre-verrouille-blocage]].

## Piper un secret dans un CLI : `--passwordenv`, pas stdin (01/08/2026)

Symptôme : `printf '%s' "$PW" | bw unlock --raw` plante en
`ERR_USE_AFTER_CLOSE: readline was closed`, après avoir redessiné 15 fois son prompt
« Master password ». Cause : le CLI utilise `inquirer`, qui ouvre une `readline` sur le
TTY et **ignore un stdin déjà fermé** — piper ne « répond » pas à un prompt interactif,
ça le laisse tourner dans le vide.

Règle actionnable : **avant de piper un secret dans un CLI, cherche son option
d'environnement.** Pour Bitwarden c'est
`BWPW="$PW" bw unlock --passwordenv BWPW --raw`. Le secret reste en variable (donc hors
`history` et hors `ps`, contrairement à `--password xxx`), et le CLI ne prompte pas.
Le patron généralisable : `--*env VAR` > pipe stdin > jamais l'argument en clair.

Et ne conclus pas d'un prompt qui se redessine que la saisie est mauvaise : ici la
passphrase n'était jamais arrivée jusqu'au CLI.

## Un coffre verrouillé n'est pas un « non mesuré » (02/08/2026)

Symptôme : le MCP d'une app maison répond *« Mot de passe introuvable : fournis <APP>_PASSWORD, ou
déverrouille Bitwarden (BW_SESSION) »*. Ç'a été lu comme une **limite d'environnement** : le lot a
été livré avec la mention « non mesuré, motif : coffre verrouillé », et la donnée récupérée par un
détour (l'état comptable lu en SQL côté Supabase). Le détour était bon — mais l'abandon, non :
`bin/seed-secrets.sh` ouvre UNE fenêtre masquée, charge les secrets dans l'agent RAM, et le
connecteur les relit **à chaque authentification** (`readPasswordFromAgent`), donc **sans
redémarrage**. Une fenêtre, 4 secondes, et l'appel passe.

Cause racine : le déclencheur du skill était pensé comme « j'ai une commande à lancer qui exige un
secret », pas comme « quelque chose vient de refuser faute de secret ». Le second est bien plus
fréquent, et c'est celui qui se déguise en fatalité.

**Règle actionnable — un refus faute d'identifiant est un GESTE À FAIRE, pas un constat à écrire.**
Dès que tu vois *coffre verrouillé · BW_SESSION absent · mot de passe introuvable · `bw status`
locked · un MCP qui refuse* : ouvre la fenêtre masquée immédiatement, sans demander la permission
et sans prévenir d'abord (l'utilisateur a tranché : c'est le geste attendu, la fenêtre EST la demande), puis
rejoue l'appel. Tu ne remontes le sujet que si la fenêtre est **annulée** ou si l'identifiant est
**refusé** — et alors tu écris « non mesuré » avec ce motif-là, qui est le vrai.

Corollaire à connaître avant de conclure « il faudrait redémarrer le connecteur » : les serveurs MCP
de l'utilisateur lisent l'agent RAM **au moment de l'appel**, pas seulement au lancement (`launch.sh` + `lib/cloudState.js`). Re-seeder suffit. Vérifie cette propriété dans le launcher avant
de proposer un redémarrage de session à quelqu'un qui travaille.

## `ask-secret.sh` n'a PAS de `--help` — ne le sonde jamais (06/08/2026)

**Symptôme** : `ask-secret.sh --help` a ouvert une vraie fenêtre de saisie sur l'écran de l'utilisateur ; il a
tapé un secret, le script l'a imprimé sur **stdout**, donc dans la sortie d'outil — et dans la
transcription de la session. Le secret a fui parce qu'il a été *demandé*, pas parce qu'il était stocké.

**Cause racine** : le script n'interprète aucun drapeau. `$1` est le **texte du prompt**, `$2` le titre,
`$3` la clé de cache. `--help` est donc un prompt comme un autre → dialogue → impression sur stdout.
C'est son contrat (§ « Le secret est écrit UNIQUEMENT sur stdout »), pas un bug.

**Règles** :
- **Ne lance JAMAIS `ask-secret.sh` pour découvrir son usage.** Son mode d'emploi est l'en-tête du
  fichier : `sed -n '1,20p' scripts/ask-secret.sh`. Lire, jamais exécuter.
- **Ne lance JAMAIS `ask-secret.sh` nu**, c'est-à-dire hors d'une substitution `$(...)` qui alimente
  immédiatement une variable d'environnement. Nu, sa sortie EST le secret en clair dans la transcription.
- Corollaire général : **un script dont le contrat est d'imprimer un secret sur stdout ne se sonde pas.**
  Avant d'exécuter un outil inconnu du dossier `scripts/` d'un skill à secrets, lis-le.
- Si la fuite a eu lieu : le dire à l'utilisateur **immédiatement et en clair**, ne pas ré-afficher la valeur, et
  **faire tourner le secret** — une valeur passée dans une transcription est compromise, point.

## La fenêtre masquée protège la SAISIE, pas la DESTINATION (12/08/2026)

**Symptôme** : un code Bitwarden collecté proprement par `ask-secret.sh` (champ masqué, RAM) puis
poussé par `tmux send-keys` dans le prompt « New device verification required. Enter OTP » — et le
prompt l'a **réaffiché en clair** dans le pane. Un `capture-pane` de contrôle l'a ensuite rapatrié
dans la transcription. Le secret n'a pas fui à la saisie ; il a fui à l'arrivée.

**Cause racine** : tout ce skill est écrit du point de vue de l'ENTRÉE. Rien n'y disait qu'un prompt
CLI n'étoile pas forcément ce qu'il reçoit : `bw unlock` masque, un prompt d'OTP non.

**Règles** :
- **Avant d'envoyer un secret vers un prompt interactif, vérifier qu'il masque.** Dans le doute,
  ne pas passer par le terminal : chercher l'option d'environnement (`--passwordenv`, `--*env VAR`),
  une clé d'API, ou un flux non-interactif.
- **Jamais de `capture-pane` sur un pane qui vient de recevoir un secret.** `kill-session` d'abord.
- Pour **Bitwarden en automatisation**, la voie propre est la **clé d'API personnelle**
  (`client_id` / `client_secret`, coffre web → Paramètres → Sécurité → Clés) : ni 2FA, ni
  vérification d'appareil, ni prompt. `bw login --apikey` lit `BW_CLIENTID` / `BW_CLIENTSECRET`
  depuis l'environnement.
- Fuite avérée : le dire **immédiatement et en clair**, ne pas ré-afficher, purger ce qui est
  purgeable (tmux, `~/.bash_history`, fichiers `/dev/shm`), et **faire tourner le secret**.

## `ssh` : le secret passe par STDIN, jamais dans la commande distante (17/08/2026)

**Symptôme** : rien de visible — c'est là le problème. Un déploiement sur le VPS a été lancé en
`ssh vps "echo '$SECRET' | sudo -S bash /tmp/deploy.sh"`. Ça marche, et ça expose le mot de passe
sudo dans la **ligne de commande du client ssh**, donc dans `ps aux` de la machine locale pendant
toute la durée de la commande — lisible par n'importe quel process de la session.

**Cause racine** : le skill interdit `--password xxx` pour un outil local, mais ne disait rien du
cas `ssh` — où l'interpolation de la commande DISTANTE se fait dans les arguments du client LOCAL.
La double lecture (« ce n'est pas un argument de l'outil, c'est du texte pour le shell distant »)
suffit à se convaincre qu'on respecte la règle alors qu'on la viole.

**Forme correcte** — le secret entre par le pipe, la commande distante ne le contient pas :

```bash
printf '%s\n' "$SECRET" | ssh vps 'cat > /tmp/.s; chmod 600 /tmp/.s
  sudo -S -p "" <commande> < /tmp/.s
  shred -u /tmp/.s'
```

Le fichier `/tmp/.s` en 0600 est le prix à payer pour rejouer `sudo -S` plusieurs fois dans la même
session ssh ; il est détruit dans la même commande. Pour UN seul `sudo`, ne pas écrire de fichier :
`printf '%s\n' "$SECRET" | ssh vps 'sudo -S -p "" <commande>'`.

**Règle** : avant toute interpolation `"$SECRET"` dans une chaîne, demande-toi si cette chaîne
devient un **argument de processus** quelque part — `ssh`, `tmux send-keys`, `osascript -e`,
`docker run`, `kubectl exec`. Si oui, passe par stdin. La table des process est publique.

## `sudo -S … > fichier` : la redirection `<` ÉCRASE le pipe, et c'est le SECRET qui s'écrit (30/08/2026)

**Symptôme** : un `cat` du fichier de configuration qu'on vient d'écrire rend **le mot de
passe sudo en clair** — dans le fichier, et dans la transcription de la session.

**La commande fautive**, écrite en croyant appliquer la règle « le secret passe par stdin » :

```bash
printf '%s\n' "$SECRET" | ssh vps 'cat > /tmp/.s; chmod 600 /tmp/.s
  printf "[Service]\nRestart=always\n" | sudo -S -p "" tee /etc/…/override.conf < /tmp/.s'
```

**Cause racine** : dans `cmd | sudo -S tee fichier < /tmp/.s`, le shell applique la
redirection `< /tmp/.s` **après** le pipe. Elle remplace donc entièrement stdin :
`sudo` y lit le mot de passe (correct), puis passe **le reste de ce même flux** à `tee`
— et `tee` écrit le contenu de `/tmp/.s`, c'est-à-dire le secret, dans le fichier cible.
Le `printf` de gauche n'arrive jamais nulle part. La commande réussit, rien n'alerte.

C'est le piège symétrique de la leçon du 17/08 : là on interdisait d'interpoler le secret
dans la commande distante ; ici la faute est de faire porter à **un seul flux** deux rôles
— authentifier `sudo` ET alimenter la commande qu'il lance.

**Règle actionnable — ne JAMAIS alimenter en contenu une commande lancée par `sudo -S`.**
`sudo -S` consomme stdin ; ce qui suit ne doit rien en attendre. Les deux formes sûres :

```bash
# 1. le contenu passe par un FICHIER, jamais par le même flux que le mot de passe
cat > /tmp/contenu <<'CONF'
[Service]
Restart=always
CONF
sudo -S -p "" install -m 644 -o root -g root /tmp/contenu /etc/…/override.conf < /tmp/.s
rm -f /tmp/contenu

# 2. ou bien : `sudo -v` d'abord (il consomme le mot de passe), PUIS le pipe sans -S
sudo -S -v < /tmp/.s && printf '…' | sudo tee /etc/…/fichier >/dev/null
```

**Réflexe de contrôle, à faire systématiquement** : après avoir écrit un fichier via
`sudo`, **relire son contenu** avant de passer à la suite. Une seule ligne, et elle
transforme une fuite silencieuse en incident visible tout de suite. Ici, c'est le `cat`
de vérification qui a révélé la fuite — sans lui, le mot de passe dormait en clair dans
`/etc/systemd/system/`.

**Et si c'est arrivé** : le dire à l'utilisateur **immédiatement et en clair**, ne pas
ré-afficher la valeur, réécrire le fichier correctement, `drop` la clé du cache RAM, et
**faire tourner le secret** — une valeur passée dans une transcription est compromise,
point. Cf. la leçon du 12/08, même conclusion par un autre chemin.

## Quand tu n'es pas sûr : vérifie en lecture seule d'abord

Avant une action **destructive ou irréversible** qui dépend du secret (déchiffrer-puis-réécrire un coffre, écraser un fichier, déployer), si tu as un doute sur la validité du secret, fais d'abord un **test en lecture seule** : déchiffre / authentifie sans rien écrire ni envoyer, et confirme que ça passe. Ça évite de partir dans une opération à mi-chemin avec un mauvais secret.

## Lire le résultat et continuer

C'est tout l'intérêt : **l'utilisateur ne colle jamais la sortie**. Tu l'as nativement (tu as lancé la commande). Les scripts bien faits s'auto-rapportent (`✓ …` / `✗ …`) — en cas de succès, l'utilisateur n'a rien à faire. Enchaîne sur l'étape suivante. Ne lui redemande la sortie que si la commande échoue de façon opaque.

## Limite à connaître : étapes sortantes / prod

Une étape qui sort vers la production (SSH/scp vers un VPS, déploiement, appel d'API distante) peut être **bloquée par le bac à sable de Claude Code**, indépendamment du secret. Si ça arrive :
- soit l'utilisateur lance **cette ligne-là** lui-même (souvent sans secret, ex. un `./deploy.sh`),
- soit il ajoute une **règle de permission Bash** dédiée pour autoriser ce script précis.
Le mécanisme de saisie de secret de ce skill ne contourne pas ces garde-fous — il règle seulement le problème du secret interactif.

## Anti-patterns (à ne pas faire)

- ❌ Demander à l'utilisateur de **coller** son mot de passe dans le chat.
- ❌ Lui tendre une commande avec un placeholder `…`/`<password>` à remplacer.
- ❌ Mettre le secret en argument en clair (`--password xxx`, `-p xxx`) → fuite `history` + `ps`.
- ❌ Stocker un secret maître dans Keychain / Bitwarden / `.env` « pour la prochaine fois ».
- ❌ `echo`/log du secret, même pour debug.

## `bw unlock` refuse une passphrase JUSTE : osascript rend du NFD (08/09/2026)

**Symptôme** : `bw unlock --passwordenv` répond `The decryption operation failed` sur un mot de
passe maître correctement tapé. Lu comme une typo → 2ᵉ fenêtre → même échec.

**Cause racine** : la fenêtre macOS (`osascript`) rend les caractères accentués en **NFD**
(« é » = e + accent combinant). Bitwarden dérive sa clé sur les octets **NFC**. Deux chaînes
visuellement identiques, deux clés différentes. `ask-secret.sh` ne normalise pas.

**Règle actionnable — normalise en NFC toute valeur sortie de `ask-secret.sh` avant de la donner
à un outil qui dérive une clé** (Bitwarden, GPG, age, un coffre chiffré maison) :

```bash
SECRET="$(printf '%s' "$RAW" | python3 -c 'import sys,unicodedata;sys.stdout.write(unicodedata.normalize("NFC",sys.stdin.read()))')"
```

Corollaire pour le « anti-typo, mais ciblé » : un premier échec de déchiffrement sur un mot de
passe **contenant un accent** n'est pas une preuve de mauvaise saisie — retente d'abord en NFC
avant de conclure et de rouvrir une fenêtre.

## Quand ça casse — index des post-mortem (`references/diagnostics.md`)

Un échec sur une commande à secret ne se conclut pas de tête. **Avant de rouvrir une fenêtre ou
d'accuser la saisie**, lis la ligne qui correspond, et le fichier si elle te concerne :
`references/diagnostics.md`.

| Symptôme | Règle, en une ligne |
|---|---|
| L'utilisateur retape un secret qu'il a mémorisé 24 h | clé de cache omise ou nom dérivé (`vps` ≠ `vps-sudo`) — 44 % des appels historiques ; un script en aval peut ouvrir SA fenêtre |
| Une étape échoue sur « passphrase invalide » | compare le **kid** : s'il concorde, la passphrase est BONNE — garde le cache, débogue l'aval |
| Un seed annonce « ✓ chargé » et le service refuse | un `set` ne peut pas échouer : re-sonde `has` par clé, résous l'item par `id`, jamais de repli sur `notes` |
| Une API rend 403 avec un jeton du coffre | lis le CORPS de la réponse ; 401 ≠ 403 ; pose un `User-Agent` réaliste |
| `bw get item` rend du vide ou traîne | `bw` est stateful : charge UNE fois dans l'agent ; refuse bruyamment une sortie vide ; `timeout` n'existe pas sur macOS |
| Tu vas faire retaper une valeur saisie dans cette session | `vault-add.mjs --value-cache-key <clé>` — et compare d'abord la date de révision au coffre |
