#!/usr/bin/env bash
# next.sh — auto-continuation d'une roadmap autonome (mécanisme concret de l'étape « change de session »).
#
# Rôle : relancer une session Claude Code FRAÎCHE (contexte propre) pour le step suivant,
# en réinjectant CONTINUATION_PROMPT.md. La session courante appelle ce script en TOUT
# DERNIER geste quand STATE: RUNNING, puis se termine → la fenêtre de contexte repart à zéro
# et chaque passe apparaît comme une session distincte dans cloudcode.
#
# Softcodé : aucune valeur en dur. Le repo, la branche et le prompt viennent de l'arbo.
# Réglages par variables d'env (défauts entre {}) :
#   ROADMAP_MODEL   {opus}                 modèle de la session relancée
#   ROADMAP_PROMPT  {scripts/roadmap/CONTINUATION_PROMPT.md}  prompt de reprise
#   ROADMAP_PERM    {--dangerously-skip-permissions}          posture permissions
#   ROADMAP_RESUME_LEFT {4}                reprises programmées restantes (anti-boucle)
#
# Ce script ne DÉCIDE rien : il relance. C'est le prompt de reprise qui décide de l'appeler
# (RUNNING) ou pas (AWAITING_DECISION / BLOCKED / DONE / STOPPED → on ne relance pas).
#
# DEUX GARDES, DEUX HORIZONS — et il a fallu la panne du 12/08/2026 pour comprendre qu'un seul
# ne suffit pas. Le garde de démarrage (2 s) attrape la mort IMMÉDIATE : mauvais binaire, `setsid`
# absent, session non authentifiée. Le superviseur détaché attrape la mort APRÈS PREMIER TRAVAIL,
# qui est la forme exacte que prend une limite de service : la fille démarre, travaille 90 s, puis
# rend `You've hit your session limit · resets 5pm (UTC)` et meurt. Le premier garde la déclarait
# vivante, next.sh imprimait « session fraîche relancée » et la chaîne mourait en silence — 20 h,
# alors que le compte redevenait disponible 55 minutes plus tard.
#
# LE SUPERVISEUR NE REPREND PLUS SEULEMENT SUR LA LIMITE (18/09/2026). Il ne rattrapait que la
# panne qui ANNONCE sa levée, au motif qu'une mort sans message signifiait « relayée ou arrêtée
# proprement ». Faux : une session peut s'éteindre en plein step — en attendant la sortie d'un
# gate, par exemple — sans poser d'état d'arrêt ni détacher de fille. STATE reste RUNNING, zéro
# session tourne, et seul le watchdog le voyait : or il crie, il ne reprend pas. Le superviseur
# distingue donc maintenant le relais normal (une fille a pris la main) de la chute (personne),
# et relance dans le second cas — sous fenêtre de grâce, double relevé et budget.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MODEL="${ROADMAP_MODEL:-opus}"
# le seuil de contexte voyage vers la session fille (ctx-guard.sh le relit)
CTXMAX="${ROADMAP_CTX_MAX:-140000}"
BINPROP="${ROADMAP_CLAUDE_BIN:-}"
# L'IDENTITÉ NE S'HÉRITE PAS TOUJOURS — elle se RELIT à chaque relais.
# Mesuré le 03/09/2026 (sur un VPS distant) : la 1re session, lancée avec CLAUDE_CODE_OAUTH_TOKEN dans
# son environnement, a fait tout son step ; sa FILLE est morte au premier tour sur
# « Not logged in · Please run /login », log de 46 Ko, STATE resté RUNNING. Un jeton
# d'ENVIRONNEMENT ne traverse pas l'outil Bash de la session mère : hériter n'est pas relire.
# Le chemin du .env qui porte l'identité voyage donc explicitement, et next.sh le SOURCE avant
# de détacher — puis le repropage, pour que le relais suivant en fasse autant.
AUTHENV="${ROADMAP_AUTH_ENV:-}"
[ -n "$AUTHENV" ] && [ -f "$AUTHENV" ] && { set -a; . "$AUTHENV"; set +a; }

PROMPT_FILE="${ROADMAP_PROMPT:-scripts/roadmap/CONTINUATION_PROMPT.md}"
PERM="${ROADMAP_PERM:---dangerously-skip-permissions}"
PROGRESS="$(dirname "$PROMPT_FILE")/PROGRESS.md"
LOGDIR="$HOME/.handoff/$(basename "$ROOT")"
mkdir -p "$LOGDIR"

# --- Sondes partagées (mêmes règles que watchdog.sh) -------------------------------------------

# SCOPÉE AU DÉPÔT. Un `pgrep -f "claude -p"` global répond « vivant » dès qu'une session tourne
# n'importe où sur la machine. `/proc` n'existe pas sur macOS : `lsof` prend le relais.
chaine_vivante() {
  local pid c
  for pid in $(pgrep -f "claude -p" 2>/dev/null || true); do
    if [ -r "/proc/$pid/cwd" ]; then c="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    else c="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true)"; fi
    [ "$c" = "$ROOT" ] && return 0
  done
  return 1
}

etat_non_relancable() {
  [ -f "$PROGRESS" ] && grep -qE '^STATE:[[:space:]]*(AWAITING_DECISION|BLOCKED|DONE|STOPPED)' "$PROGRESS"
}

notifier() {
  local msg="$1" send
  send="${MINDER_SEND:-$HOME/.config/minder/send.sh}"
  [ -x "$send" ] && "$send" "$msg" >/dev/null 2>&1 || true
  command -v osascript >/dev/null 2>&1 &&
    osascript -e "display notification \"$msg\" with title \"roadmap $(basename "$ROOT")\"" >/dev/null 2>&1 || true
  echo "$(date -u '+%F %T UTC') | $msg" >> "$LOGDIR/resume.log"
}

# « resets 5pm (UTC) », « resets 5:30pm (UTC) », « resets at 11am (UTC) » → secondes d'attente.
# Échoue exprès (return 1) si l'heure est illisible OU si le fuseau n'est pas explicitement UTC :
# une attente forfaitaire vaut mieux qu'une reprise calculée sur un fuseau supposé.
secondes_avant_reset() {
  local txt="$1" raw h m ampm cible maintenant delta
  raw="$(printf '%s' "$txt" | grep -oiE 'resets[[:space:]]+(at[[:space:]]+)?[0-9]{1,2}(:[0-9]{2})?[[:space:]]*(am|pm)' | head -1 || true)"
  [ -n "$raw" ] || return 1
  printf '%s' "$txt" | grep -qiE '\(UTC\)' || return 1
  h="$(printf '%s' "$raw" | grep -oE '[0-9]{1,2}' | head -1 || true)"
  m="$(printf '%s' "$raw" | grep -oE ':[0-9]{2}' | head -1 | tr -d ':' || true)"
  ampm="$(printf '%s' "$raw" | grep -oiE '(am|pm)' | head -1 | tr '[:upper:]' '[:lower:]' || true)"
  [ -n "$h" ] || return 1
  h=$((10#$h)); m=$((10#${m:-0}))
  [ "$ampm" = "pm" ] && [ "$h" -lt 12 ] && h=$((h + 12))
  [ "$ampm" = "am" ] && [ "$h" -eq 12 ] && h=0
  cible=$((h * 3600 + m * 60))
  maintenant=$(( 10#$(date -u +%H) * 3600 + 10#$(date -u +%M) * 60 + 10#$(date -u +%S) ))
  delta=$((cible - maintenant))
  [ "$delta" -le 0 ] && delta=$((delta + 86400))
  printf '%s' "$delta"
}

# --- Mode SUPERVISEUR (invocation interne, détachée) -------------------------------------------
#
# Attend la fin de la fille, puis décide : mort ordinaire → rien (la chaîne s'est déjà relayée ou
# s'est arrêtée proprement) ; mort SUR LA LIMITE → attendre l'heure annoncée et relancer.
# Une panne qui annonce sa propre levée se PLANIFIE ; l'alerte seule laisse la chaîne par terre.
if [ "${1:-}" = "--superviser" ]; then
  PID="${2:?}"; FILLE_LOG="${3:?}"; RESTANTS="${4:-4}"

  while kill -0 "$PID" 2>/dev/null; do sleep 15; done
  sleep 5   # laisser le log se fermer

  # SIGNATURE STRICTE : la limite est le DERNIER mot de la fille, pas un mot qu'elle a prononcé.
  # (Une session qui parlerait de limites dans son compte rendu ne doit pas armer une reprise.)
  #
  # ⚠️ LE MOTIF PORTE SUR LA FORME DE LA PHRASE, PAS SUR LE NOM DE LA LIMITE. Première version :
  # `(session|usage) limit`, écrite sur le seul message qu'on avait vu. Quatre heures plus tard le
  # service en a rendu un autre — « You've hit your **weekly** limit · resets 4pm (UTC) » — le
  # motif n'a pas mordu, et la chaîne est retombée exactement comme avant le correctif. Une garde
  # calquée sur un échantillon ne garde que cet échantillon : on reconnaît donc « (tu) as atteint
  # ta … limite », quel que soit le mot du milieu, et on garde les formes nommées en filet.
  DERNIERE="$(grep -v '^[[:space:]]*$' "$FILLE_LOG" 2>/dev/null | tail -1 || true)"
  if printf '%s' "$DERNIERE" \
    | grep -qiE "(hit|reached) your [a-z0-9 -]{0,24}limit|(session|usage|weekly|daily|monthly|rate) limit"
  then
    MOTIF="limite de session"
  else
    # ---- MORT INOPINÉE (18/09/2026) ------------------------------------------------------
    # Ici, la fille est morte SANS annoncer de limite. La première version concluait « mort
    # ordinaire → rien », sur la prémisse que la chaîne s'était forcément soit relayée, soit
    # arrêtée proprement. **La prémisse est fausse**, et app-notes-de-frais l'a montré le
    # 18/09 : la session s'est éteinte en attendant la sortie de `npm run audit`, sans poser
    # d'état d'arrêt et sans détacher de fille. STATE est resté RUNNING avec zéro session, et
    # la chaîne est restée par terre jusqu'à ce qu'un humain dise « relance ».
    #
    # Le watchdog voit exactement cet état — il l'a même notifié — mais il CRIE, il ne REPREND
    # pas. Entre un superviseur qui ne reprend que sur limite et un garde qui ne reprend jamais,
    # une mort en plein step ne réveillait personne. C'est ce trou qu'on ferme.
    #
    # Trois gardes, parce que reprendre à tort est pire que ne pas reprendre :
    #   1. la FENÊTRE DE RELAIS. Entre la fille qui finit son step et celle que next.sh détache,
    #      il existe quelques secondes sans aucun `claude -p` : conclure tout de suite ferait
    #      démarrer une session concurrente à CHAQUE relais. On attend, puis on vérifie DEUX
    #      fois espacées — même doctrine que les deux relevés du watchdog.
    #   2. l'ÉTAT. Un arrêt volontaire (BLOCKED, DONE, STOPPED) ne se rattrape pas.
    #   3. le BUDGET. Une fille qui meurt aussitôt relancerait à l'infini : ROADMAP_RESUME_LEFT
    #      plafonne, et la dernière reprise le dit au lieu de s'éteindre en silence.
    ATTENTE_RELAIS="${ROADMAP_RELAY_GRACE:-60}"
    sleep "$ATTENTE_RELAIS"
    if chaine_vivante; then exit 0; fi          # relais normal : la fille suivante a pris la main
    sleep "$(( ATTENTE_RELAIS / 2 ))"
    if chaine_vivante; then exit 0; fi          # 2e relevé — un seul suffirait à crier à tort
    if etat_non_relancable; then exit 0; fi     # arrêt volontaire : rien à rattraper, et pas de bruit
    if [ "$RESTANTS" -le 0 ]; then
      notifier "chaîne MORTE en plein step et budget de reprises épuisé → elle reste à l'arrêt"
      exit 0
    fi
    notifier "chaîne morte en plein step (sans limite annoncée) — reprise immédiate (il restera $((RESTANTS - 1)) reprise(s))"
    ROADMAP_RESUME_LEFT="$((RESTANTS - 1))" exec "$SELF"
  fi

  if etat_non_relancable; then
    notifier "chaîne arrêtée sur limite de session, mais STATE n'est plus RUNNING → pas de reprise"
    exit 0
  fi
  if [ "$RESTANTS" -le 0 ]; then
    notifier "limite de session ATTEINTE et budget de reprises épuisé → la chaîne reste à l'arrêt"
    exit 0
  fi
  if chaine_vivante; then
    notifier "limite de session détectée, mais une session tourne déjà sur le dépôt → pas de reprise"
    exit 0
  fi

  ATTENTE="$(secondes_avant_reset "$DERNIERE" || true)"
  if [ -n "$ATTENTE" ]; then
    ATTENTE=$((ATTENTE + 180))          # marge : l'heure annoncée est un bord, pas une promesse
  else
    ATTENTE=1800                        # heure illisible ou fuseau non UTC → forfait prudent
  fi
  # jamais plus de 6 h de sommeil sans reprendre la main (abaissable pour éprouver le mécanisme)
  PLAFOND="${ROADMAP_RESUME_MAX_WAIT:-21600}"
  [ "$ATTENTE" -gt "$PLAFOND" ] && ATTENTE="$PLAFOND"

  notifier "limite de session — reprise programmée dans $((ATTENTE / 60)) min ($DERNIERE)"
  sleep "$ATTENTE"

  # RIEN N'EST ACQUIS APRÈS UN SOMMEIL : l'état et le terrain se relisent avant de relancer.
  if etat_non_relancable; then notifier "reprise annulée : STATE n'est plus RUNNING"; exit 0; fi
  if chaine_vivante;      then notifier "reprise annulée : une session tourne déjà"; exit 0; fi

  notifier "reprise après limite de session (il restera $((RESTANTS - 1)) reprise(s))"
  ROADMAP_RESUME_LEFT="$((RESTANTS - 1))" exec "$SELF"
fi

# --- Mode NORMAL : relancer une session fraîche -------------------------------------------------

# Garde-fou anti-emballement EN PREMIER : ne pas relancer si l'état n'est pas RUNNING (halt propre).
# (Le prompt est censé déjà l'avoir vérifié ; double sécurité côté mécanisme.)
if etat_non_relancable; then
  echo "next.sh: STATE non-RUNNING → pas de relance (halt volontaire)." >&2
  exit 0
fi

[ -f "$PROMPT_FILE" ] || { echo "next.sh: prompt introuvable: $PROMPT_FILE" >&2; exit 1; }
# QUEL BINAIRE ? Sur une machine où plusieurs installs cohabitent, `claude` dans le
# PATH n'est pas forcément celui qui est AUTHENTIFIÉ. Vécu le 11/08/2026 sur le VPS :
# PATH non-interactif → /usr/bin/claude (2.1.177, « Not logged in »), alors que la
# session valide est ~/.local/bin/claude (2.1.227). Une chaîne autonome lancée sur le
# mauvais binaire meurt à la première session, silencieusement.
CLAUDE_BIN="${ROADMAP_CLAUDE_BIN:-}"
if [ -z "$CLAUDE_BIN" ]; then
  # à défaut de consigne, l'install utilisateur prime sur l'install système
  for c in "$HOME/.local/bin/claude" "$(command -v claude 2>/dev/null || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { CLAUDE_BIN="$c"; break; }
  done
fi
[ -n "$CLAUDE_BIN" ] && [ -x "$CLAUDE_BIN" ] || { echo "next.sh: binaire 'claude' introuvable" >&2; exit 1; }

TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOGDIR/roadmap-$TS.log"

# DÉTACHEMENT PORTABLE. `setsid` n'existe QUE sous Linux : sur macOS la ligne
# échouait en « command not found » — mais comme elle tournait en arrière-plan,
# next.sh imprimait quand même « session relancée » et sortait en 0. Une chaîne
# autonome qui annonce un relais sans l'avoir fait s'arrête sans que personne ne
# le sache (vécu au dry-run du 11/08/2026, 5 min de chaîne fantôme).
# DÉTACHEMENT RÉEL. `nohup` protège du SIGHUP, PAS d'un kill de groupe de processus : tant
# que l'enfant reste dans le groupe de la session qui l'a lancé, il meurt avec elle. C'est ce
# qui a tué le watchdog de visual-lab après 4 h le 12/08, en silence. `setsid` règle ça sous
# Linux mais N'EXISTE PAS sur macOS ; Python, si, et `os.setsid()` est POSIX. Le double fork
# garantit qu'on n'est pas déjà leader de groupe — condition sans laquelle setsid() échoue.
detache() {   # detache CMD ARGS…   (redirections posées par l'appelant)
  if command -v setsid >/dev/null 2>&1; then setsid nohup "$@"
  else python3 -c 'import os,sys
if os.fork(): os._exit(0)
os.setsid()
if os.fork(): os._exit(0)
os.execvp(sys.argv[1], sys.argv[1:])' "$@"
  fi
}

detache env ROADMAP_CTX_MAX="$CTXMAX" ROADMAP_AUTH_ENV="$AUTHENV" ROADMAP_CLAUDE_BIN="${BINPROP:-$CLAUDE_BIN}" "$CLAUDE_BIN" -p "$(cat "$PROMPT_FILE")" \
  --model "$MODEL" \
  $PERM \
  --output-format text \
  >"$LOG" 2>&1 </dev/null &
CHILD=$!
disown "$CHILD" 2>/dev/null || true

# TRACE DU DERNIER LANCEMENT — ET SURTOUT PAS UNE CIBLE.
# ⚠️ Ce pid n'identifie PAS la session vivante, et s'y fier a coûté deux mensonges (12/08/2026) :
# `roadmap status` annonçait « chaîne arrêtée » sur une chaîne qui produisait des commits, et
# `roadmap stop` aurait dit « rien à arrêter » sans rien tuer. La raison : le `claude` du PATH
# est un script d'ENVELOPPE, donc `$!` désigne l'enveloppe et pas la session qu'elle finit par
# exécuter. Un fichier qui a l'air d'être la vérité sans l'être est pire que pas de fichier.
# La cible fiable est ailleurs : les process `claude -p` dont le répertoire courant est le dépôt
# (cf. `chaine_pids` dans handoff.mjs et `chaine_vivante` ci-dessus). Ce fichier ne sert plus qu'à
# dater le dernier lancement.
echo "$CHILD" > "$LOGDIR/roadmap.last-launch-pid"
echo "$LOG"   > "$LOGDIR/roadmap.lastlog"

# GARDE n°2 — SUPERVISEUR DÉTACHÉ : il survit à la session qui l'a lancé (c'est tout l'intérêt),
# ne coûte rien tant que la fille vit, et ne se réveille que sur la signature de la limite.
# ⚠️ ARMÉ AVANT LE GARDE n°1, et l'ordre est un correctif, pas un détail : une limite déjà
# atteinte tue la fille en moins de 2 s, le garde n°1 sort alors en 1 — et un superviseur armé
# après lui ne l'aurait jamais été, précisément dans le cas qu'il doit couvrir.
RESUME_LEFT="${ROADMAP_RESUME_LEFT:-4}"
detache env ROADMAP_CTX_MAX="$CTXMAX" ROADMAP_AUTH_ENV="$AUTHENV" ROADMAP_CLAUDE_BIN="${BINPROP:-$CLAUDE_BIN}" \
  ROADMAP_MODEL="$MODEL" ROADMAP_PROMPT="$PROMPT_FILE" ROADMAP_PERM="$PERM" \
  bash "$SELF" --superviser "$CHILD" "$LOG" "$RESUME_LEFT" \
  >>"$LOGDIR/resume.log" 2>&1 </dev/null &
disown $! 2>/dev/null || true

# GARDE n°1 — LE LANCEUR NE DOIT PAS POUVOIR MENTIR : on vérifie que l'enfant vit encore.
# Il ne prouve QUE le démarrage. La survie est l'affaire du garde n°2.
sleep 2
if ! kill -0 "$CHILD" 2>/dev/null && ! chaine_vivante; then
  echo "next.sh: ÉCHEC — la session fille est morte immédiatement. Log: $LOG" >&2
  tail -5 "$LOG" >&2 || true
  exit 1
fi

echo "next.sh: session fraîche relancée (model=$MODEL) → $LOG"
echo "next.sh: superviseur de survie armé (reprises restantes: $RESUME_LEFT)"
