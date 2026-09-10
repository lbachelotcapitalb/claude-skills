---
name: handoff
description: >-
  Passer une session de travail Claude Code d'une machine à une autre via git, ET piloter une
  roadmap autonome multi-steps sur le VPS avec auto-continuation. Utilise-le quand l'utilisateur veut :
  déléguer/reprendre le travail ailleurs (« reprends sur le VPS », « bascule sur ma machine ») ;
  lancer une roadmap autonome sur le VPS depuis le desktop (« lance la roadmap sur le VPS »,
  « exécute ces steps en autonomie », session visible dans code.<ton-domaine>) ; ou faire un état
  des lieux des sessions Claude du VPS (« montre-moi les sessions du VPS », « tableau des sessions »).
  Softcodé via .claude/handoff.json — marche pour tout couple de machines partageant le même remote.
---

# Handoff — déléguer/reprendre une session entre machines

## Deux modes
- **Handoff git** (`out`/`in`/`check`, `delegate`) : transporter le code + un brief entre machines. Sections juste en dessous.
- **Roadmap driver** (`roadmap …`) : exécution AUTONOME multi-steps sur le VPS, avec auto-continuation
  (chaque step relance une session fraîche) + tableau de sessions. **→ « Mode roadmap driver » en bas, et son détail dans `references/roadmap-driver.md`.**

## Règle qui traverse les deux modes : ce qui tourne sans surveillance NOTIFIE MINDER
Tout travail délégué à une machine que personne ne regarde — le VPS, ou le Mac pendant que le propriétaire
fait autre chose — envoie **exactement deux lignes** sur Telegram : une **quand il se bloque**,
une **quand il a fini**. Jamais par step. C'est le seul canal qui atteint quelqu'un : une
notification macOS n'existe pas sur un VPS, et cloudcode est une surface qu'on **consulte**
(chaîne restée morte 20 h le 12/08/2026, faute d'yeux).

| Ce qui tourne | Qui envoie la ligne | Blocage | Fin |
|---|---|---|---|
| `roadmap` (chaîne autonome) | la session elle-même (prompt) **et** le watchdog | ✅ | ✅ |
| `delegate` (agent headless) | l'enveloppe `run-wrapper.sh`, sur le code de sortie | ✅ | ✅ |
| `out` / `in` (reprise manuelle) | personne — **et c'est voulu** | — | — |

`out`/`in` sont interactifs : l'humain est devant, le notifier serait du bruit. La ligne de
partage n'est pas « VPS vs Mac », c'est **surveillé vs pas surveillé**.

Le garde extérieur (watchdog) et la session envoient tous deux : le watchdog lit un ÉTAT, la
session connaît la RAISON. Deux lignes valent mieux qu'un arrêt découvert le lendemain.

## Quand l'utiliser
Deux Claude Code auto-hébergés (ton Mac, un VPS, un autre poste) **ne partagent
aucune synchro cloud**. Ce skill réalise le handoff par **git** : on transporte
le **code** (commit/push WIP) et un **brief de reprise** (`HANDOFF.md`). La
conversation elle-même ne migre pas — on la reconstitue via le brief, ce qui est
le plus robuste (chemins absolus, MCP et checkpoints diffèrent d'une machine à
l'autre).

Déclenche-le dans deux situations symétriques :
- **Départ** : l'utilisateur part / veut continuer ailleurs → `out`.
- **Arrivée** : on démarre Claude Code sur l'autre machine et on reprend → `in`.

## Pré-requis : la config softcodée
Tout est piloté par `.claude/handoff.json` à la racine du repo (jamais de valeurs
en dur dans le skill, pour qu'il soit partageable). Schéma commenté :
`references/config-example.json`.

Si le fichier est absent, **propose de le créer** :
```bash
node ~/.claude/skills/handoff/scripts/handoff.mjs init --to <nom> --ssh user@host --path '~/<repo>'
```
Puis ouvre `.claude/handoff.json` et confirme `ssh` / `path` avec l'utilisateur
(ne devine pas l'hôte). Plusieurs machines = plusieurs entrées sous `remotes`.

Champs clés : `wipBranch` (pattern, placeholders `{repo}` `{user}` `{date}`),
`noDeployToBranches` (branches auto-déployées comme `main`+Netlify — le skill
**refuse** d'y pousser du WIP), `handoffFile`, `remotes`, `defaultRemote`.

## Transmission des docs de la tâche (identifier + préconiser)
Avant de partir, **inventorie ce dont la tâche a besoin** et vérifie que la machine
cible peut l'atteindre. Le handoff transporte le **code + le brief** par git ; tout
le reste, la cible y **accède à distance** — il faut donc le constater, pas le supposer.

Lance le diagnostic automatique :
```bash
node ~/.claude/skills/handoff/scripts/handoff.mjs check --to <remote>
# ou sans config :  … check --ssh user@host [--repo <git-url>]
```
Il sonde la cible canal par canal et **imprime des préconisations**. Grille de lecture :

| Canal | Comment ça se transmet | Si la cible n'y a pas accès |
|---|---|---|
| **Code (GitHub)** | `push`/`pull` sur le remote partagé — le cœur du skill. | Deploy key du repo (alias `~/.ssh/config`) ou `gh auth login`. Sans ça, `in` échoue. |
| **Supabase** | base cloud commune ; la cible se connecte via URL+clés. Schéma = **migrations commitées**. | Clés via `.env` du projet sur la cible, ou `npm i -g supabase`. |
| **Netlify** | rien à transmettre : deploy auto au merge sur `main`. Build = `netlify.toml` commité. | Token seulement si la tâche modifie le dashboard. |
| **Google Drive** | montable sur la cible via `rclone` (mount/sync). | Installer rclone, **ou** relocaliser les docs dans git / un bucket (Supabase Storage, R2). |
| **iCloud** | ❌ **jamais** vers un serveur Linux (pas de client Apple). | **Relocaliser** les docs « iCloud-only » dans git / bucket / Drive **avant** le handoff. |
| **Secrets** | jamais commités ; la cible lit ses `.env` locaux. | Pas de Bitwarden CLI sur le VPS → déposer le `.env` requis d'abord. |

Règle : **tout doc qui ne vit que dans iCloud (ou un drive non monté sur la cible)
doit être relocalisé avant le `out`** — sinon le `claude` distant ne pourra pas le lire.
Si `check` remonte un canal manquant pour la tâche, **préconise le correctif** (le
montrer, pas l'appliquer en douce) avant de poursuivre.

## Procédure — DÉPART (déléguer le travail)
Le point délicat n'est pas git, c'est le **brief**. Le `claude` distant repart
sans contexte : la qualité de la reprise dépend entièrement de `HANDOFF.md`.

0. **`check` la cible** (section ci-dessus) si la tâche touche autre chose que le code
   (Supabase, Drive, secrets…). Relocalise / provisionne ce qui manque avant de continuer.
1. **Écris `HANDOFF.md` à la racine du repo** avant tout. Sois concret et bref :
   - **Objectif** : ce qu'on cherche à faire (1-2 phrases).
   - **Fait** : ce qui est déjà en place dans ce WIP.
   - **À faire ensuite** : la prochaine action précise, fichiers/`fichier:ligne` concernés.
   - **Vérifier** : la commande qui prouve que ça marche (`npm run build`, tests…).
   - **Pièges** : ce qui casserait si on l'ignore (ex. ne pas pousser sur `main`).
2. **Lance le push** :
   ```bash
   node ~/.claude/skills/handoff/scripts/handoff.mjs out --to <remote> -m "WIP: <résumé>"
   ```
   Le script bascule sur la branche WIP (la crée si besoin), commite tout
   (HANDOFF.md inclus), pousse sur `origin`, et **imprime la commande SSH de
   reprise** prête à coller sur la machine distante.
3. **Donne la commande de reprise à l'utilisateur** (le bloc imprimé). Pour un accès protégé,
   la connexion SSH demande un mot de passe : propose de l'exécuter toi-même via
   le skill `autocli-password` (fenêtre macOS masquée, secret en RAM seulement)
   plutôt que de lui faire coller quoi que ce soit. Sinon il colle le bloc lui-même.

## Procédure — ARRIVÉE (reprendre le travail)
Quand Claude Code tourne sur la machine d'arrivée (VPS ou retour Mac) :
```bash
node ~/.claude/skills/handoff/scripts/handoff.mjs in --from <remote>
```
Le script fait `fetch` + `checkout` de la branche WIP + `pull`, puis **affiche
`HANDOFF.md`**. Lis-le, résume l'état à l'utilisateur, et **enchaîne sur la
prochaine action** indiquée — vérifie le build avant d'aller plus loin.

Le retour (VPS → Mac) est strictement symétrique : un `out` depuis le VPS, un
`in` depuis le Mac, sur la même branche WIP.

## Garde-fous (importants)
- **Jamais de WIP sur une branche auto-déployée.** Le script refuse si la branche
  WIP tombe dans `noDeployToBranches`/`protectedBranches` (cas typique :
  `main` déclenche Netlify). C'est volontaire — ne contourne pas, corrige la config.
- **Pas de session transférée.** N'annonce pas que « la conversation continue » :
  c'est le code + le brief qui voyagent. Si l'utilisateur veut vraiment l'historique
  littéral du chat, c'est une autre approche (copie du transcript `.jsonl` avec
  slug de chemin identique) — hors périmètre de ce skill.
- **Conflits.** `in` fait un `pull --ff-only` : s'il échoue, il y a divergence —
  préviens l'utilisateur et propose un rebase manuel plutôt que de forcer.

## Commandes (handoff git)
- `init` — crée `.claude/handoff.json`.
- `out [--to <remote>] [-m "msg"] [--exec]` — pousse le WIP + commande de reprise (`--exec` lance le SSH directement).
- `in [<branche>] [--from <remote>]` — récupère le WIP + affiche le brief.
- `check [--to <remote>] [--ssh user@host] [--repo <url>]` — sonde les canaux de transmission de la cible (GitHub/Supabase/Netlify/Drive/secrets) + préconise. iCloud toujours marqué exclu.
- `status` — branche courante, branche WIP cible, remotes connus.

Tout passe par `scripts/handoff.mjs` (Node, zéro dépendance).

---

# Mode roadmap driver — exécution autonome multi-steps

Une grosse tâche (refonte en N étages, migration, audit de parc) sature la fenêtre d'une seule
session. Ce mode l'exécute **en auto-continuation** : une session fait un step, commite, pousse,
puis en détache une **fraîche** qui repart d'un contexte propre. On itère la roadmap ici, elle
s'exécute là-bas, et on suit par `roadmap status` — ou depuis le téléphone via cloudcode.

**📖 Tout le détail est dans [`references/roadmap-driver.md`](references/roadmap-driver.md).**
Ouvre-le **avant** de : lancer ou relancer une chaîne · toucher `next.sh` / `ctx-guard.sh` /
`CONTINUATION_PROMPT.md` · diagnostiquer une chaîne arrêtée · armer un watchdog · semer des
secrets · ajouter du travail à chaud. Il porte ce qu'aucune commande ne rattrape après coup :
le **prévol** (cinq pannes de préconditions muettes, désormais bloquantes), la doctrine
**« la chaîne ne s'arrête jamais en cours de route »**, la **limite de session** — la seule panne
programmée d'une chaîne, qui se planifie au lieu de s'alerter —, le mode `--local` et sa
différence structurante (le VPS est un cache jetable, le poste ne l'est pas), et la règle des
secrets semés **avant** le premier step.

Trois choses à savoir sans ouvrir le fichier, parce qu'elles évitent un dégât :

1. **Le kit vit DANS le dépôt cible** (`scripts/roadmap/`), jamais dans le skill : la cible ne
   voit que ce que git transporte. Désigner une source hors dépôt, c'est programmer un halt.
2. **On ne pousse jamais sur un remote de déploiement** depuis une chaîne, et le clone de la
   chaîne ne doit connaître **qu'un seul remote**. C'est ça qui protège la prod, pas un réglage
   d'hébergeur.
3. **Un mécanisme qui démarre un process vérifie qu'il tourne** — et sur le bon horizon : 2 s
   prouvent le démarrage, pas la survie.

## Commandes (roadmap)
- `roadmap init [--title ..] [--objectif ..] [--branch ..] [--gate ..] [--step ..] [--force]` — scaffold le kit dans `scripts/roadmap/`.
- `roadmap launch [--to <remote>|--local] [--branch ..] [--model opus] [--no-watch]` — prévol, bootstrap repo+branche sur la cible, démarre la 1re session, **arme le watchdog d'office** (`--no-watch` pour un dry-run).
- `roadmap status [--to <remote>|--local]` — STATE/CURRENT_STEP + session active + derniers commits + tail log.
- `roadmap sessions [--to <remote>]` — tableau synthétique des sessions Claude de la cible.
- `roadmap answer --decision "..." [--to <remote>] [--branch ..]` — injecte la réponse à une frontière + relance.
- `roadmap stop [--to <remote>|--local]` — arrête la chaîne (pose `STATE: STOPPED`, sans quoi une session en vol repartirait).
- `roadmap watch [--to <remote>|--local] [--every 120] [--label ..]` — arme le watchdog **sur la cible** (il s'installe dans `~/.local/lib/handoff/`, hors dépôt, donc il survit aux `git reset --hard` de la chaîne) : notifie **Minder** sur blocage, frontière, fin ou chaîne morte, puis se retire.
- `roadmap enqueue [--to <remote>|--local] "<travail>" [--why "..."]` — ajoute du travail à chaud dans la file **de la cible**, sans arrêter la chaîne ni committer.
