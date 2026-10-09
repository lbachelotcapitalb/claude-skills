# Mode roadmap driver — exécution autonome multi-steps

> Référence détaillée du mode roadmap du skill `handoff`. Le corps de `SKILL.md` ne garde que
> le déclencheur et les commandes ; tout ce qui décide dun geste vit ici.


## Sommaire — ouvre la section, pas le fichier entier

| Section | Ce qu'elle décide | Va la lire quand |
|---|---|---|
| **L'idée** | ce que le mode fait, et pourquoi une session fraîche par step | tu découvres le mode |
| **Le kit** | les 5 fichiers versionnés dans le dépôt CIBLE, et leurs rôles | tu montes une roadmap |
| **Workflow** | l'ordre des gestes, de `init` au suivi | tu lances une chaîne |
| **La chaîne ne s'arrête JAMAIS** | ce qu'on fait d'un obstacle : journal + « À REPRENDRE », jamais un halt | la chaîne bute sur quelque chose |
| **Garde-fous roadmap** | branche isolée, gate avant commit, ce qu'un lanceur n'a pas le droit de mentir | avant de toucher au mécanisme |
| **La limite de session** | la seule panne PROGRAMMÉE d'une chaîne, et pourquoi elle se planifie au lieu de s'alerter | une chaîne s'est tue sans erreur |
| **Le prévol** | les 5 préconditions muettes qui ont coûté une nuit, désormais bloquantes | `launch` refuse de démarrer |
| **Ce qui demande un humain** | `/login` piloté par tmux, clé de déploiement | cible neuve, une fois par machine |
| **Mode LOCAL** | le VPS est un cache jetable, le poste ne l'est pas | la chaîne doit tourner ici |
| **`roadmap enqueue`** | ajouter du travail à chaud, sur la cible, sans committer | tu vois quelque chose pendant qu'elle tourne |
| **Le watchdog** | sonde scopée au dépôt, deux relevés avant de crier | tu veux être prévenu d'un arrêt |
| **Les secrets** | semés AVANT le premier step, en RAM, par pipe | la chaîne aura besoin d'un identifiant |
| **La notification** | une seule, à `DONE` | tu règles le bruit |
| **Commandes** | la liste complète avec leurs drapeaux | tu cherches la syntaxe |

## L'idée
Une grosse tâche (refactor en N étages) sature vite la fenêtre de contexte d'une seule session.
Ce mode l'exécute sur le VPS en **auto-continuation** : on itère la roadmap **ici (desktop)**, on la
lance sur le VPS, et chaque session y fait **UN step** puis **relance une session fraîche** pour le
suivant. Chaque passe apparaît comme une session dans **code.<ton-domaine>** (cloudcode lit
`~/.claude/projects`) → l'utilisateur suit depuis son téléphone et n'intervient qu'aux **frontières** (décisions).

Deux choix de conception assumés :
- **Auto-continuation, pas de driver tmux/loop externe** : c'est la session elle-même qui relance la
  suivante via `scripts/roadmap/next.sh`.
- **Tout online, GitHub = source unique de vérité** : le dossier sur le VPS est un **cache jetable**, pas
  du « dev qui vit sur le VPS ». Claude Code a besoin d'un working tree sur disque (il n'édite pas GitHub
  par API), et la seule machine qui exécute la chaîne est le VPS — donc un checkout y est inévitable ;
  mais il est **resynchronisé DUR depuis GitHub au début de chaque session** (`git fetch && git reset
  --hard origin/<branche>`) et **poussé à la fin de chaque step** (`git commit && git push origin
  <branche>`). Rien de valeur ne vit jamais seul sur le VPS ; on peut supprimer le dossier à tout moment
  (`launch` le recrée). Corollaire : **depuis le desktop tu suis toute la progression par `git fetch`**
  sur la branche, sans SSH (SSH seulement pour lancer/piloter). Pousser une **branche isolée ≠ deploy**
  (deploy = merge main → `deploy-vps.sh`), donc c'est sûr.

## Le kit (versionné DANS le repo cible : `scripts/roadmap/`)
> **Preuve de fonctionnement** (dry-run du 11/08/2026, dépôt jetable, seuil abaissé à 40 000) :
> 6 sessions enchaînées sans intervention, 6 sous-tâches, **6 identifiants de session distincts**,
> **0 doublon** (gate anti-répétition), `STATE: DONE`, et `next.sh` qui refuse de relancer après
> `DONE`. Les 4 sous-tâches du step 2 ont été faites par 4 sessions différentes : le relais a bien
> eu lieu **au milieu** du step, sur seuil de contexte, et chaque reprise est repartie du checkpoint.

- **`PROGRESS.md`** — l'état vivant : `STATE` (RUNNING / DONE / STOPPED),
  `CURRENT_STEP`, la checklist des steps, les règles dures (branche, gate), le **checkpoint intra-step**
  (sous-checklist du step en cours, pour reprendre mi-step après un crash) et le journal append-only.
- **`CONTINUATION_PROMPT.md`** — le prompt de reprise que chaque session relit : charge l'état → fait
  1 step → gate → commit → MAJ PROGRESS → `bash next.sh` si `RUNNING`, sinon halt.
- **`next.sh`** — le **mécanisme concret** d'auto-continuation : détache une `claude -p` FRAÎCHE avec
  `--model opus --dangerously-skip-permissions` (Opus + ignore-permissions **automatiques**), lisant
  CONTINUATION_PROMPT.md. Garde-fou : ne relance pas si STATE ≠ RUNNING.
- **`ctx-guard.sh`** *(11/08/2026)* — le **seuil de fenêtre de contexte**. « 1 step = 1 session »
  suppose qu'un step tient toujours dans une fenêtre : faux dès qu'un step est gros. Le garde lit
  `CLAUDE_CODE_SESSION_ID` + la transcription vivante (`~/.claude/projects/<slug>/<id>.jsonl`),
  somme `input_tokens + cache_read + cache_creation` de la dernière entrée à `usage`, et rend
  `OK` (exit 0) ou `HANDOFF` (exit 10). Seuil `ROADMAP_CTX_MAX`, défaut **140000** — ce qui compte
  n'est pas le seuil mais la MARGE qu'il laisse (~60k) pour finir la sous-tâche, écrire le
  checkpoint, committer et relancer. Le prompt de reprise l'appelle **après chaque sous-tâche**, et
  sur `HANDOFF` passe la main au milieu du step. `next.sh` propage le seuil à la session fille.

Tout est softcodé via `.claude/handoff.json` → `remotes.<nom>` : `repoPath` (chemin VPS, cloné à la
volée si absent), `repoSsh` (URL de clone SSH — privé ⇒ pas d'HTTPS), `cloudcodeUrl`, et `roadmap`
(`model`, chemins du kit).

## Workflow
1. **Itérer la roadmap ici (desktop).** Rédige/ajuste `PROGRESS.md` (la checklist des steps, bornés à
   un étage cohérent chacun, avec les FRONTIÈRES marquées) et `CONTINUATION_PROMPT.md`. Si le kit
   n'existe pas encore :
   ```bash
   node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap init \
     --title "…" --objectif "…" --branch <branche> --gate "npm run audit" --step S1
   ```
   Puis **commit + push** la branche (le kit voyage par git).
2. **Lancer sur le VPS** (desktop → VPS : bootstrap repo+branche+kit, démarre la 1re session) :
   ```bash
   node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap launch --to vps --branch <branche>
   ```
   Ça clone le repo sur le VPS si absent, checkout la branche, `chmod +x next.sh`, et démarre. Donne à
   l'utilisateur l'URL cloudcode pour suivre. **La chaîne tourne ensuite seule** step après step.
3. **État des lieux** — à la demande, tableau synthétique des sessions Claude du VPS :
   ```bash
   node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap sessions --to vps
   ```
   (Projet · en cours 🟢 · dernière session · activité · tours · nb de sessions.) Et l'état du driver :
   ```bash
   node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap status --to vps
   ```
## La chaîne ne s'arrête JAMAIS en cours de route (12/08/2026)

Demandé par le propriétaire après quatre frontières en une nuit : « je ne veux rien trancher, enlève
tout garde-fou, ça ne doit jamais se bloquer en plein milieu ». C'est tenable, et la mesure le
montrait déjà : **sur ces quatre frontières, trois n'étaient pas des décisions** — une source restée
hors du dépôt, un chiffrage faux, un identifiant absent. Le prévol tue les deux premières avant le
lancement ; la troisième se contourne.

**Il n'existe plus d'état d'arrêt intermédiaire.** Ni attente de décision, ni `BLOCKED`. Les états
sont `RUNNING`, `DONE`, et `STOPPED` (coupé par le propriétaire). Tout ce qui coince suit la même
règle : **journaliser dans `DECISIONS_LOG.md`, inscrire ce qui reste dû dans la section
« À REPRENDRE » de `PROGRESS.md`, et continuer.**

| Ce qui coince | Réponse — jamais d'arrêt |
|---|---|
| un choix | trancher selon sa reco, journaliser ce qu'on écarte, appliquer |
| gate rouge | revert, journaliser la sortie, **passer au step suivant**, inscrire le step raté |
| identifiant manquant | sauter la seule sous-tâche concernée, faire le reste du step, l'inscrire |
| outil ou donnée manquante | prendre le chemin le plus proche qui prouve la même chose |
| hors du mandat écrit | ne pas le faire, journaliser la ligne, continuer le reste |

**La seule chose hors de son périmètre** — et ce n'est pas une permission à demander, c'est une
définition : **sortir de la branche isolée**. Merge, `checkout main`, force-push, déploiement,
écriture en base de production. Ce n'est pas un frein mais la condition de tout le reste : c'est
parce que rien n'est irréversible que la chaîne peut trancher seule partout ailleurs. Retirer cette
ligne-là ne rendrait pas la chaîne plus autonome, ça rendrait ses erreurs définitives.

Corollaire à assumer : **un step imparfait mais journalisé vaut mieux qu'une chaîne à l'arrêt.** Le
propriétaire relit le journal et les commits quand il veut ; il ne surveille pas. Un travail
approximatif se reprend, une chaîne arrêtée à 3 h du matin ne se rattrape pas.

4. **Arrêt.** La chaîne ne s'arrête d'elle-même qu'à `DONE`. `roadmap stop` la coupe ; `roadmap launch` la reprend
   depuis `CURRENT_STEP`, et même mi-step grâce au checkpoint. L'utilisateur répond soit **dans
   la session cloudcode** (elle reprend en interactif), soit **via toi** :
   ```bash
   node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap answer --to vps --decision "go reco 1 ; option B pour 2"
   ```
   (injecte la réponse, remet `STATE: RUNNING`, relance la chaîne).
5. **Arrêter** si besoin : `roadmap stop --to vps` (tue la session claude du repo ; la chaîne ne se
   relance pas).

## Garde-fous roadmap (importants)
- **Branche isolée uniquement.** La roadmap encode ses propres règles dures dans PROGRESS.md : jamais
  `git checkout main`, jamais merge main, jamais `git push`/deploy sauf demande explicite de l'utilisateur
  (aligné sur la doctrine « sessions de nuit auto VPS »). Ne les contourne pas.
- **Gate avant chaque commit.** Chaque step passe le gate (ex. `npm run audit` exit 0) sinon revert +
  journal + step suivant (jamais de halt). Le VPS ne lance QUE le gate synthétique ; la certification sur données/livres
  réels reste desktop (cf. PROGRESS.md du refactor bilan).
- **Ignore-permissions + Opus = choix assumé sur box exposée.** `next.sh` bypasse les permissions et
  force Opus. C'est voulu (fluidité autonome) ; la seule barrière restante est le mot de passe cloudcode.
  Ne l'active que pour une branche isolée avec des règles dures claires.
- **Un lanceur ne doit pas pouvoir mentir** *(11/08/2026, trouvé au dry-run)*. `next.sh` utilisait
  `setsid`, **qui n'existe que sous Linux** : sur macOS la ligne échouait en « command not found »
  mais, tournant en arrière-plan, `next.sh` imprimait quand même « session fraîche relancée » et
  sortait en 0. Cinq minutes de chaîne fantôme, un STATE figé, et rien dans le log de la roadmap.
  Corrigé : détachement portable (`setsid` si présent, sinon `nohup`+`disown`) **et vérification que
  l'enfant vit encore 2 s après** — sinon exit 1 avec le tail du log. Règle générale : un script dont
  le rôle est de démarrer un process vérifie qu'il tourne, il ne se fie jamais à son propre `&`.
  ⚠️ **Ces 2 s ne couvrent que la mort immédiate** : une limite de service tue la fille APRÈS son
  premier travail, et le garde la déclare vivante (12/08, voir « La limite de session »).
- **Fin de chaîne silencieuse.** Si une session meurt (blip API) avant d'appeler `next.sh`, la chaîne
  s'arrête **proprement** (rien ne relance) — c'est un halt, pas une corruption. `roadmap status` le
  montre ; relancer = `roadmap launch` (idempotent : reprend depuis CURRENT_STEP, et **mi-step** grâce au
  checkpoint intra-step — les sous-tâches déjà poussées en `wip(…)` ne sont pas refaites ni repayées).
- **La limite de session n'est pas un aléa, c'est une échéance.** Voir la section dédiée ci-dessous :
  une chaîne qui tourne à pleine vitesse épuise sa fenêtre de 5 h **en 5 h**, par construction.

## La limite de session — la seule panne PROGRAMMÉE de la chaîne (12/08/2026)

**Post-mortem mesuré, chantier « Sapin froid » (une app patrimoniale).** La chaîne a enchaîné ~30 sessions Opus
sans interruption de 11:12 à 16:03 UTC. La fille détachée à 16:03:46 a démarré normalement, a
travaillé environ 90 secondes (outils exécutés, résultats en transcription), puis à 16:05:13 a rendu
un unique message : `You've hit your session limit · resets 5pm (UTC)`. Son log fait **50 octets, une
ligne**. `PROGRESS.md` est resté `RUNNING`, l'arbre propre, le dernier `wip(…)` poussé. Personne n'a
rien vu pendant **20 heures**, alors que le compte était de nouveau disponible dès 17:00 UTC.

**Ce que c'est, et ce que ce n'est PAS.** Ce n'est pas le quota de l'abonnement, et le dire ainsi
envoie le propriétaire vérifier une consommation qui n'a rien à se reprocher. C'est la **fenêtre de
session de 5 h**, alignée sur l'heure (ici le bloc 12:00→17:00 UTC), et c'est **la chaîne elle-même
qui l'a remplie** — pas l'humain. Nommer la mauvaise limite, c'est faire chercher au mauvais endroit.

**Pourquoi le garde de vitalité ne l'attrape pas.** `next.sh` vérifie que la fille vit **2 secondes**
après le détachement. Ici elle vit, elle travaille, et elle meurt à +90 s : le garde passe, le parent
imprime « session fraîche relancée », sort en 0 et se termine. Le garde du 11/08 couvrait la mort
**immédiate** (mauvais binaire, `setsid` absent) ; il ne couvre pas la mort **après premier
travail**, qui est justement la forme que prend une limite de service.

**La bonne réponse n'est pas d'alerter, c'est de reprendre à l'heure dite.** Le message porte
l'heure de reset. Une chaîne autonome doit donc, sur ce motif :

1. **reconnaître le motif** — log fille d'une seule ligne contenant `session limit` / `resets` ;
2. **parser l'heure de reset** et **s'armer** dessus (`at` si présent, sinon un cron one-shot qui se
   retire), avec une marge de quelques minutes ;
3. **journaliser l'attente** dans `PROGRESS.md` (`STATE: RUNNING`, ligne « en attente de reset
   HH:MM UTC ») — un état qui dort n'est pas un état mort, mais il doit se lire comme tel ;
4. ne **jamais** sortir en 0 sur un log fille d'une ligne : un lanceur qui ne peut pas mentir sur le
   démarrage ne doit pas pouvoir mentir sur la **survie**.

Corollaires de doctrine, valables au-delà de ce skill :

- **Un garde de vitalité doit couvrir la fenêtre où la mort survient.** Deux secondes prouvent qu'un
  process a démarré, pas qu'il vit. Le bon horizon est celui du premier travail utile (≥ 120 s, ou
  mieux : attendre la première trace de production dans le log).
- **Le watchdog manque là où personne ne regarde.** Il n'existait qu'en `--local` alors que la
  panne se produit sur le VPS, précisément parce que le VPS n'a pas d'yeux. Sur cible distante, la
  surveillance doit vivre **sur la cible** et notifier par Minder. **Fait le 15/08/2026** — mais
  trois jours après ce constat : voir « Il a longtemps refusé de s'armer à distance » plus bas.
- **Une panne programmée se planifie, elle ne s'improvise pas.** Toute limite qui annonce sa propre
  levée (quota, fenêtre, fenêtre de maintenance) se traite par une reprise datée, pas par une alerte.


## Le prévol — parce que toutes les pannes de la nuit du 11/08 étaient des préconditions muettes

**Post-mortem du premier lancement réel** (refonte d'une UI applicative). Cinq pannes, cinq causes
différentes, **une seule forme** : une précondition fausse que personne n'avait vérifiée, et qui ne
se manifestait qu'une fois la chaîne partie — ou pas du tout.

| Panne | Ce qu'on voyait | Ce que c'était |
|---|---|---|
| `setsid: command not found` | `next.sh` imprimait « session fraîche relancée », exit 0 | `setsid` n'existe pas sous macOS ; la ligne échouait en arrière-plan |
| clone dans `/home/<user>/~/<repo>` | `PROJECT_SLUG=-home-<user>-~-<repo>` | le tilde de `repoPath` n'est pas développé côté distant |
| 1re session morte, log 0 octet | rien | le `claude` du PATH non-interactif était une 2ᵉ install **non authentifiée** |
| gate impossible | `npm run audit` → exit 127 | `node_modules` vide sur la cible : le gate n'avait jamais rien vérifié |
| halt au premier geste | `AWAITING_DECISION` | la source de vérité de la roadmap vivait **hors du dépôt** |

La dernière est la plus instructive parce que la doctrine la couvrait déjà (« tout doc qui ne vit
que dans iCloud doit être relocalisé avant le `out` ») et qu'elle a quand même été commise : une
règle écrite dans un paragraphe se contourne, une règle **exécutée par le lanceur** ne se contourne
pas. D'où le prévol.

**`roadmap launch` refuse désormais de démarrer** tant que tout n'est pas vert :

- **local** — `PROGRESS.md` et `CONTINUATION_PROMPT.md` sont scannés : un chemin en `~/`,
  `/Users/…` ou `/home/<user>/…` **bloque le lancement** avec le numéro de ligne. La cible ne voit
  que ce que git transporte ; désigner une source hors dépôt, c'est programmer un halt.
- **distant** — `repoPath` doit être **absolu** (le tilde n'est pas développé) · le binaire `claude`
  est résolu (`claudeBin`, sinon `~/.local/bin` avant `/usr/bin`) **et prouvé authentifié par un
  vrai aller-retour** (`-p "PONG"`), parce qu'« installé » ne veut pas dire « connecté » ·
  `node_modules` est installé (`npm ci`) si absent, sinon le gate sort en 127 sans rien vérifier.
- le binaire validé par le prévol est **propagé** à la 1re session (`ROADMAP_CLAUDE_BIN`), qui le
  repropage à ses filles : la chaîne entière tourne sur le binaire prouvé, pas sur celui du PATH.

Règle générale qui s'applique bien au-delà de ce skill : **un mécanisme qui démarre un process
vérifie que le process tourne.** Il ne se fie ni à son propre `&`, ni à la présence d'un binaire, ni
à l'existence d'un dossier.

## Ce qui demande encore un humain — une fois par machine, jamais deux

L'objectif est zéro autorisation récurrente. Deux choses ne peuvent structurellement pas
s'auto-provisionner, et **elles ne se redemandent pas** une fois faites :

| Geste | Pourquoi il ne s'automatise pas | Durée de vie |
|---|---|---|
| `/login` Claude sur la cible | OAuth : l'autorisation est un consentement humain dans un navigateur | jusqu'à révocation — le jeton se rafraîchit seul |
| Clé de déploiement GitHub | écrire dans les réglages d'un dépôt privé demande un droit d'admin | permanent, une fois par dépôt |

**Le `/login` se pilote — l'utilisateur ne tape jamais dans un terminal.** Procédure éprouvée le
11/08, à rejouer telle quelle :

1. `tmux new-session -d -s vpslogin -x 200 -y 50 "<claudeBin>"` sur la cible — un tmux **à toi**,
   dans lequel tu peux écrire ; ne jamais compter sur le terminal de l'utilisateur.
2. `tmux send-keys -t vpslogin "/login"` puis, **dans un second appel**, `Enter` : le premier tour
   ouvre le menu des commandes, il faut le laisser se dessiner avant de valider.
3. Choisir **l'option 1 (abonnement)**, pas la 2 (facturation API) — sur un chantier long l'écart
   n'est pas cosmétique. Vérifier ensuite avec `/status` : le bandeau ASCII affiche l'ancien mode
   tant qu'on n'a pas relu, c'est `Login method:` qui fait foi.
4. `tmux capture-pane -p` pour lire l'URL, la donner à l'utilisateur **reconstituée en une seule
   ligne** (elle est coupée par la largeur du pane).
5. Récupérer le code par **fenêtre masquée** (skill `autocli-password`, secret jetable, donc sans
   clé de cache) et l'injecter **par stdin**, jamais en argument :
   `printf '%s' "$CODE" | ssh <cible> 'read -r c; tmux send-keys -t vpslogin -l "$c"; sleep 1; tmux send-keys -t vpslogin Enter'`
   — en argument, le code apparaîtrait dans `ps` de la machine distante.
6. `OAuth error: 400` ne veut pas dire « mauvais code » : chaque invite a son propre
   `code_challenge`. Si l'utilisateur a une autre invite ouverte ailleurs, il autorisera la
   mauvaise. **Lui dire explicitement de fermer les autres**, et n'utiliser que l'URL de TON tmux.

## Mode LOCAL (`--local`) — la chaîne tourne sur le poste, pas sur le VPS

Le driver a été écrit VPS-first pour que le propriétaire suive depuis son téléphone. Mais le mécanisme —
une session fait un step, puis en détache une FRAÎCHE — ne doit rien au VPS : il ne demande
qu'un `claude` authentifié et un dépôt git. Sur le poste de travail, `--local` évite le clone,
la latence SSH et la resynchro, et la chaîne travaille sur le dépôt RÉEL.

```bash
node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap launch --local --branch main
node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap status --local
node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap stop   --local
```

`--local` n'exige **pas** `.claude/handoff.json` : il n'y a rien à router. Pas de `cloudcodeUrl`
non plus — on suit par `roadmap status` et par `git log`.

**LA différence de doctrine, et elle est structurante.** Sur le VPS, le dossier est un CACHE
JETABLE : chaque lancement fait `git reset --hard origin/<branche>`. **En local, jamais.** Le
dépôt est la source de vérité — un reset dur y détruirait tout travail non poussé, y compris
celui d'une autre session ouverte sur le même dossier. Le mode local se contente de vérifier la
branche, et il **refuse de démarrer sur un arbre sale** (la 1re session commiterait le travail
en cours de quelqu'un d'autre). Le kit du repo doit donc porter ses propres règles : ni
`reset --hard`, ni `git add -A`.

**Ce que le premier lancement local a coûté (12/08/2026), et qui est corrigé** — trois pannes,
toutes de la même famille que le `setsid` du dry-run VPS : un mécanisme écrit pour Linux qui
échoue en silence sur macOS.

| panne | symptôme | correctif |
|---|---|---|
| Jeton d'authentification | sur macOS il vit dans le **trousseau**, pas dans `~/.claude/.credentials.json` : le prévol déclarait « NON authentifié » une machine parfaitement connectée et tuait le lancement | sonde par `security find-generic-password` sous Darwin (présence seule — le jeton ne transite nulle part) |
| `readlink /proc/<pid>/cwd` | `/proc` n'existe pas sur macOS : `status` annonçait « aucune session » sur une chaîne qui tournait, et `stop` ne tuait rien en disant « rien à arrêter » | `lsof -a -p <pid> -d cwd` en repli |
| Prévol « chemins hors dépôt » | le kit citait `~/<repo>` — sa propre racine — et le garde le refusait | la racine du dépôt n'est plus comptée comme un chemin hors dépôt |

### Ajouter du travail À CHAUD — `roadmap enqueue`

```bash
node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap enqueue --to <remote> \
  "<ce qu'il faut faire>" --why "<ce qui l'a révélé>"
```

**La file se dépose LÀ OÙ LA CHAÎNE TOURNE** — `--to <remote>` pour une chaîne VPS, `--local`
pour une chaîne du poste. ⚠️ *Défaut vécu le 13/08/2026, corrigé* : `enqueue --to vps` acceptait
le drapeau puis écrivait dans le dépôt **local**. La commande confirmait « entrée déposée », la
file locale se remplissait, et la seule destinataire — la chaîne du VPS — n'a jamais rien vu.
**Un canal qui confirme une remise qu'il n'a pas faite est pire que pas de canal** : on croit
avoir passé la consigne, donc on ne la repasse pas. La commande **nomme désormais sa
destination** (`sur « vps » (/home/leo/<repo>)`), et refuse en clair si le dépôt n'existe pas sur
la cible plutôt que de se rabattre sur le dépôt courant.

En regardant une chaîne tourner, on relève des choses : une erreur, un apprentissage, une
correction. Sans ce canal, la seule issue est d'attendre son arrêt — et **une file qui ne se
remplit qu'à l'arrêt n'est pas une file, c'est une liste de regrets.**

Ce que la commande fait, et surtout ce qu'elle NE fait pas : elle écrit une entrée dans
`<kit>/INBOX.md` et **s'arrête là — ni commit, ni push, ni écriture dans PROGRESS.md**. C'est la
contrainte de concurrence git qui dicte ce design : pousser pendant que la chaîne travaille,
c'est risquer qu'elle ait un commit local non encore poussé, donc un `push` en non-fast-forward,
donc une session autonome qui improvise devant un conflit. Ici le pire cas est **un step de
délai** ; il n'existe pas de cas où l'ajout la casse.

C'est la CHAÎNE qui intègre : l'étape 1-bis du prompt de reprise lui fait vider l'INBOX au début
de chaque session — les entrées passent en fin de checklist de PROGRESS.md, avec leur « pourquoi »,
et les deux fichiers sont commités ensemble. Le prompt lui interdit explicitement de les traiter
dans la foulée : elle les REPORTE, le tour en cours reste au step courant.

Corollaire à ne pas perdre : le mécanisme lui-même s'installe à chaud sans commit (prompt modifié
sur disque, INBOX non suivi). La première entrée à déposer est donc *« commiter le mécanisme »* —
sinon il ne survit pas à un clone.

### Le watchdog — parce qu'une chaîne qui s'arrête ne prévient personne

```bash
node ~/.claude/skills/handoff/scripts/handoff.mjs roadmap watch --local [--every 120]
```

La chaîne sait s'arrêter proprement (`AWAITING_DECISION`, `BLOCKED`, `DONE`) et sait mourir
salement (blip API, session tuée). **Dans les deux cas elle écrit son état dans un fichier et se
tait.** Tant qu'une session de surveillance regarde, ça passe — mais une session a une fenêtre
finie, et la chaîne, elle, continue : c'est la configuration exacte où un halt reste invisible
des heures. Le watchdog vit **détaché**, donc il survit à la session qui l'a lancé, et il
notifie **Minder d'abord** (la machine locale ensuite, avec son) sur frontière, blocage, fin ou
mort — puis il se retire. Il ne relance rien et ne pilote rien.

Deux points sans lesquels il ne garderait rien, tous deux **prouvés par contre-épreuve** avant
d'être livrés (un garde qui n'a jamais mordu doit démontrer qu'il sait mordre) :

- **Sa sonde est SCOPÉE AU DÉPÔT.** Un `pgrep -f "claude -p"` global répond « vivant » dès
  qu'une session tourne n'importe où sur la machine — une autre chaîne, un one-shot de
  l'utilisateur — et le watchdog déclarerait saine une chaîne morte depuis une heure. Il compare
  le **répertoire courant** de chaque process (`lsof` sur macOS, `/proc` sur Linux).
- **Il exige DEUX relevés consécutifs** avant de crier à la mort. Entre la session qui finit un
  step et la fille que `next.sh` détache, il existe une fenêtre de quelques secondes sans aucun
  `claude -p` : conclure au premier relevé produirait une fausse alerte **à chaque relais**, et
  un garde qui crie à tort est un garde qu'on finit par ignorer.

`roadmap watch` retire le watchdog précédent avant d'armer le nouveau — deux gardes sur le même
dépôt alerteraient deux fois.

### Il a longtemps refusé de s'armer à distance — le motif était faux (corrigé le 15/08/2026)

`roadmap watch` mourait sur un `die()` dès qu'on visait le VPS : « un watchdog distant
notifierait une machine que personne ne regarde ». **C'était vrai du CANAL, pas du GARDE.**
`osascript` n'existe pas sur un serveur Linux ; Minder, si. La conclusion correcte n'était donc
pas d'interdire le garde à distance, c'était de lui changer de canal — et c'est exactement ce
que le 12/08 avait déjà démontré (cloudcode est une surface qu'on **consulte** ; à 16:05 UTC
personne ne consultait, et la chaîne VPS est restée morte 20 h). Trois jours ont séparé le
constat écrit dans ce fichier de sa mise en œuvre dans le code : **une doctrine notée mais pas
implémentée ne garde rien.**

Ce qui a changé, et pourquoi chaque point est nécessaire :

| Décision | Ce qu'elle évite |
|---|---|
| Minder **avant** la notification locale | un garde qui crie dans une machine vide |
| Le garde s'installe dans `~/.local/lib/handoff/`, **hors du dépôt** | la chaîne fait `git reset --hard` à chaque step : dans l'arbre de travail, le garde serait écrasé |
| Il est **armé d'office par `launch`** (`--no-watch` pour l'éviter) | un garde qui n'existe que quand on y pense n'existe pas la nuit où il sert |
| Il porte une **étiquette de machine** (`--label`, sinon `hostname -s`) | « chaîne morte » sans savoir laquelle des deux machines |
| Un armement raté **n'arrête pas le lancement, mais le DIT** | silence + échec : la combinaison exacte qui a coûté les 20 h |

Le watchdog **crie**, il ne **reprend** pas — et c'est le superviseur de `next.sh` qui reprend,
désormais dans DEUX cas et non plus un seul (18/09/2026) :

| Mort de la fille | Qui la voit | Ce qui se passe |
|---|---|---|
| **limite de session** (annonce sa levée) | superviseur, sur la dernière ligne du log | attente jusqu'à l'heure annoncée + 3 min, puis reprise |
| **chute en plein step** (aucun message) | superviseur, en constatant qu'aucune fille n'a pris la main | grâce de 60 s, double relevé, puis reprise immédiate |
| arrêt volontaire (`BLOCKED`, `DONE`, `STOPPED`) | les deux | rien — et pas de bruit |

Le second cas manquait, et le trou était exactement entre les deux gardes : le superviseur ne
reprenait que sur limite, le watchdog ne reprenait jamais. Une session éteinte en attendant la
sortie d'un gate laissait donc `STATE: RUNNING` avec zéro session, jusqu'à ce qu'un humain dise
« relance » (mesuré sur `app-notes-de-frais`, P7, le 18/09/2026 : le watchdog a bien notifié
« CHAÎNE MORTE » à 14:06, personne n'a repris).

Ce qui reste vrai : **le budget plafonne** (`ROADMAP_RESUME_LEFT`, 4 par défaut), et une fille qui
meurt aussitôt ne boucle pas — la dernière reprise le DIT au lieu de s'éteindre en silence. Et ce
qui reste humain : une chaîne qui `BLOCKED` sur une décision. Reprendre une décision n'est pas
rattraper une panne.

**`stop` et `status` visent `claude -p` + le répertoire du dépôt — jamais un fichier PID.**
Le pid écrit par `next.sh` avait d'abord été pris pour la cible fiable ; il ne l'est pas, parce
que le `claude` du PATH est un script d'ENVELOPPE : `$!` désigne l'enveloppe, pas la session
qu'elle exécute. Constaté le 12/08/2026 avec deux mensonges symétriques — `status` annonçait
« chaîne arrêtée » sur une chaîne qui produisait des commits, et `stop` aurait dit « rien à
arrêter » **sans rien tuer**, laissant l'utilisateur croire qu'il avait coupé. Un arrêt qui ment
est pire qu'un arrêt qui échoue bruyamment.

La cible est donc double, et les deux moitiés comptent : la ligne de commande porte `claude -p`
(ce qui distingue une session de CHAÎNE d'une session interactive de l'utilisateur ouverte dans
le même dossier — sans ce critère, `stop` emporterait la session depuis laquelle on l'a lancé),
et le répertoire courant du process EST le dépôt (`lsof` sur macOS, `/proc` sur Linux).

`stop` pose ensuite `STATE: STOPPED`, sans quoi une session déjà en vol rappellerait `next.sh`
en fin de step et la chaîne repartirait toute seule. `STOPPED` est un état à part entière :
`next.sh` refuse de relancer dessus, au même titre que `DONE`.


## Les secrets se sèment AVANT le premier step (12/08/2026)

Demandé par le propriétaire : « tu me demandes ma passphrase Bitwarden, tu la gardes en RAM VPS et
ici 24 h, et tu tires tous les secrets dont tu as besoin ensuite ». C'est le pendant de la doctrine
« jamais d'arrêt » : une chaîne qui découvre au step 12 qu'il lui manque un identifiant a déjà perdu
la nuit.

`roadmap launch` fait donc, **avant** de démarrer la 1re session :
1. dépose `secret-agent.mjs` sur la cible (`~/.local/lib/handoff/`) ;
2. réclame la passphrase par **une seule fenêtre masquée** (clé de cache `bw-master` → aucune
   fenêtre si la RAM locale l'a déjà) ;
3. la sème dans l'agent RAM **des deux machines**, TTL 24 h, jamais sur disque ;
4. **sonde** la cible avec `has` (jamais `get`, qui imprimerait la valeur) et l'annonce.

Rien de tout ça ne bloque : coffre injoignable ⇒ avertissement et la chaîne part quand même. Elle
sautera ce qui en dépend et l'inscrira dans « À REPRENDRE ».

**Le secret ne transite que par un PIPE.** Jamais un argument (visible dans `ps` de la machine
distante), jamais un prompt distant.

### ⚠️ Un prompt qui n'étoile pas RÉAFFICHE ce qu'on lui donne

Incident du 12/08/2026, à ne pas refaire. Un code Bitwarden a été collecté proprement par
`ask-secret.sh` (champ masqué, RAM), puis poussé par `tmux send-keys` dans le prompt
« New device verification required. Enter OTP » — **un champ de saisie ordinaire**. Le prompt l'a
réaffiché en clair dans le pane, un `capture-pane` de contrôle l'a rapatrié dans la transcription :
le secret a fui **à l'arrivée**, pas au départ. La fenêtre masquée protège la SAISIE, pas la
DESTINATION.

Règles :
- avant d'envoyer un secret vers un prompt interactif, **vérifier qu'il masque** (`bw unlock` masque,
  un prompt d'OTP non). Dans le doute : option d'environnement, clé d'API, ou flux non-interactif ;
- **jamais de `capture-pane` sur un pane qui vient de recevoir un secret** — `kill-session` d'abord ;
- pour **Bitwarden en automatisation**, la voie propre est la **clé d'API personnelle**
  (`BW_CLIENTID` / `BW_CLIENTSECRET`, coffre web → Paramètres → Sécurité → Clés) : ni 2FA, ni
  vérification d'appareil, **aucun prompt**. `bw login --apikey` la lit dans l'environnement.
  `bw login <email> --passwordenv` déclenche au contraire une vérification d'appareil par email —
  ne pas l'utiliser sur une machine neuve ;
- fuite avérée : le dire **immédiatement et en clair**, ne pas ré-afficher, purger (tmux,
  `~/.bash_history`, `/dev/shm`), et **faire tourner le secret**.

Voir aussi le skill `autocli-password`, où la même leçon est gravée côté saisie.

## Deux notifications, et deux seulement : l'arrêt et la fin

Par Minder (`$MINDER_SEND`, sinon `~/.config/minder/send.sh`), jamais par step — le propriétaire
ne surveille pas la chaîne, il veut être dérangé quand il a quelque chose à faire :

- **elle s'arrête** (`BLOCKED` / `AWAITING_DECISION`) → une ligne avec la RAISON ;
- **elle a fini** (`DONE`) → titre, nombre de steps, de commits, de points restés dans « À REPRENDRE ».

**Deux émetteurs, exprès.** La session écrit la ligne depuis son prompt (elle seule connaît la
raison) ; le watchdog l'écrit depuis l'extérieur (lui seul survit à une session qui meurt sans un
mot). Le recouvrement peut produire deux messages à la fin — c'est le prix, et il est bas : le
seul scénario qu'on refuse est celui où il n'en part aucun.

Même règle pour `delegate`, l'agent headless du mode git : son enveloppe (`run-wrapper.sh`, posée
dans `~/.handoff/<repo>/`) attend la fin de la session et envoie ✅ ou ❌ **selon le code de
sortie**, jamais selon ce que l'agent raconte de lui-même — un compte rendu élogieux après un
échec ne doit pas pouvoir se déclarer vainqueur.

## Commandes (roadmap)
- `roadmap init [--title ..] [--objectif ..] [--branch ..] [--gate ..] [--step ..] [--force]` — scaffold le kit dans `scripts/roadmap/`.
- `roadmap launch [--to <remote>] [--branch ..] [--model opus] [--no-watch]` — bootstrap repo+branche sur le VPS + démarre la 1re session + **arme le watchdog**.
- `roadmap watch [--to <remote>|--local] [--every 120] [--label ..]` — arme le watchdog SUR LA CIBLE (hors dépôt) : notifie Minder sur blocage, frontière, fin ou chaîne morte.
- `roadmap status [--to <remote>]` — STATE/CURRENT_STEP + session active + derniers commits + tail log.
- `roadmap sessions [--to <remote>]` — tableau synthétique des sessions Claude du VPS.
- `roadmap answer --decision "..." [--to <remote>] [--branch ..]` — injecte la réponse à une frontière + relance.
- `roadmap stop [--to <remote>]` — arrête la chaîne autonome pour ce repo.
