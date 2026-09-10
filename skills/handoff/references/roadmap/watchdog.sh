#!/usr/bin/env bash
# watchdog.sh — SURVEILLE UNE CHAÎNE ROADMAP ET PRÉVIENT QUAND ELLE S'ARRÊTE.
#
#   bash watchdog.sh /chemin/du/repo [intervalle_s]
#
# POURQUOI. La chaîne sait s'arrêter proprement (AWAITING_DECISION, BLOCKED, DONE) et elle sait
# mourir salement (blip API, session tuée). Dans les deux cas elle ne prévient PERSONNE : elle
# écrit son état dans un fichier et se tait. Tant qu'un humain — ou une session Claude — regarde,
# ça passe. Mais une session de surveillance meurt avec sa fenêtre, et la chaîne, elle, continue :
# c'est exactement la configuration où un halt reste invisible des heures.
#
# Ce script est le maillon qui manquait. Il ne pilote rien, il ne relance rien : il REGARDE, et
# il alerte par un canal que l'utilisateur voit sans rien ouvrir. Il vit détaché, donc il survit
# à la session qui l'a lancé.
#
# ⚠️ LE CANAL EST MINDER (Telegram) EN PREMIER, PAS macOS. Corrigé le 15/08/2026. Une
# notification macOS n'existe QUE sur le poste : armé sur le VPS, ce garde criait dans le vide,
# et c'est précisément là qu'il sert — le VPS est la machine que personne ne regarde. La
# notification locale reste, en second, pour le mode --local.
#
# Deux verdicts, et un seul faux positif à éviter :
#   • STATE ≠ RUNNING            → halt volontaire, on notifie et on sort.
#   • STATE = RUNNING sans session vivante → la chaîne est MORTE en vol.
#     ⚠️ Entre la session qui finit un step et la fille que next.sh détache, il existe une
#     fenêtre de quelques secondes SANS aucun `claude -p`. Conclure au premier relevé
#     produirait une fausse alerte à chaque relais — donc il faut DEUX relevés consécutifs.
set -uo pipefail

REPO="${1:?usage: watchdog.sh <repo_path> [intervalle_s]}"
EVERY="${2:-120}"
PROGRESS="${ROADMAP_PROGRESS:-scripts/roadmap/PROGRESS.md}"
# D'OÙ PARLE CE GARDE. Le message part sur le téléphone : sans le nom de la machine, le propriétaire reçoit
# « chaîne morte » sans savoir laquelle des deux. Softcodé, jamais deviné à l'exécution.
LABEL="${ROADMAP_LABEL:-$(hostname -s 2>/dev/null || echo machine)}"

cd "$REPO" || { echo "watchdog: repo introuvable: $REPO" >&2; exit 1; }
REPO="$(pwd)"          # absolu et résolu : la sonde compare des chemins, pas des chaînes
NAME="$(basename "$REPO")"

# La sonde est SCOPÉE AU DÉPÔT, et ce n'est pas un détail. Un `pgrep -f "claude -p"` global
# répond « vivant » dès qu'une session tourne N'IMPORTE OÙ sur la machine — une autre chaîne,
# un one-shot de l'utilisateur — et le watchdog déclare saine une chaîne morte depuis une heure.
# Un garde qui ne peut pas distinguer sa cible du bruit ambiant ne garde rien.
# `/proc` n'existe pas sur macOS : `lsof` prend le relais (même correctif que `roadmap status`).
chaine_vivante() {
  local pid c
  for pid in $(pgrep -f "claude -p" 2>/dev/null); do
    if [ -r "/proc/$pid/cwd" ]; then c="$(readlink "/proc/$pid/cwd" 2>/dev/null)"
    else c="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"; fi
    [ "$c" = "$REPO" ] && return 0
  done
  return 1
}
LOGDIR="$HOME/.handoff/$NAME"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/watchdog.log"

# MINDER D'ABORD, MACHINE LOCALE ENSUITE, JOURNAL TOUJOURS.
# L'ordre est le correctif du 15/08/2026 : `osascript` n'existe pas sur le VPS et, quand il
# existe, il ne réveille personne qui n'est pas devant l'écran. Minder pousse sur le téléphone,
# qui est la seule surface que le propriétaire consulte quand il ne surveille pas. Aucun canal n'est
# bloquant : un Minder injoignable ne doit pas empêcher la trace disque, sinon le garde perd
# aussi la mémoire de ce qu'il a vu.
notify() { # $1 = titre, $2 = corps
  local send
  send="${MINDER_SEND:-$HOME/.config/minder/send.sh}"
  [ -x "$send" ] && "$send" "$1 — $2" >/dev/null 2>&1 || true
  command -v osascript >/dev/null 2>&1 &&
    osascript -e "display notification \"$2\" with title \"$1\" sound name \"Submarine\"" >/dev/null 2>&1 || true
  echo "$(date '+%F %T') | $1 — $2" >> "$LOG"
}

# Le watchdog écrit SON PROPRE pid, et personne ne l'écrit pour lui. Un lanceur qui note le
# pid qu'il croit avoir démarré se trompe dès qu'une enveloppe s'intercale — c'est exactement
# ce qui a rendu `roadmap.pid` menteur (12/08). Le seul process qui connaisse son pid, c'est lui.
echo "$$" > "$LOGDIR/watchdog.pid"
echo "$(date '+%F %T') | watchdog armé sur $REPO (pid $$, sid $(ps -o sess= -p $$ | tr -d ' '), relevé toutes les ${EVERY}s)" >> "$LOG"
morts=0

while true; do
  sleep "$EVERY"

  STATE="$(grep -E '^STATE:' "$PROGRESS" 2>/dev/null | head -1 | sed 's/^STATE:[[:space:]]*//')"
  STEP="$(grep -E '^CURRENT_STEP:' "$PROGRESS" 2>/dev/null | head -1 | sed 's/^CURRENT_STEP:[[:space:]]*//')"

  case "$STATE" in
    AWAITING_DECISION)
      notify "⏳ roadmap $NAME ($LABEL) — décision attendue" "$STEP : arrêt sur une frontière. Voir DECISIONS_PENDING.md."
      exit 0 ;;
    BLOCKED)
      notify "❌ roadmap $NAME ($LABEL) — BLOQUÉE" "$STEP : gate rouge ou divergence git. La chaîne ne repartira pas seule."
      exit 0 ;;
    DONE)
      notify "✅ roadmap $NAME ($LABEL) — TERMINÉE" "Tous les steps sont soldés."
      exit 0 ;;
    STOPPED)
      echo "$(date '+%F %T') | STATE=STOPPED, arrêt demandé — le watchdog se retire" >> "$LOG"
      exit 0 ;;
    RUNNING) : ;;
    *)
      notify "⚠️ roadmap $NAME ($LABEL) — état illisible" "STATE=\"${STATE:-vide}\" dans $PROGRESS."
      exit 1 ;;
  esac

  # STATE dit RUNNING : reste à vérifier que quelque chose tourne VRAIMENT. Un STATE qui
  # affirme RUNNING sur une chaîne morte est précisément le mensonge qu'on cherche ici.
  if chaine_vivante; then
    morts=0
  else
    morts=$((morts + 1))
    echo "$(date '+%F %T') | RUNNING mais aucune session claude -p (relevé $morts/2)" >> "$LOG"
    if [ "$morts" -ge 2 ]; then
      notify "❌ roadmap $NAME ($LABEL) — CHAÎNE MORTE" "$STEP : STATE dit RUNNING mais plus aucune session ne tourne. Relancer : roadmap launch."
      exit 1
    fi
  fi
done
