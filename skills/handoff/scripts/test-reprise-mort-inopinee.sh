#!/usr/bin/env bash
# test-reprise-mort-inopinee.sh — CONTRE-ÉPREUVE du superviseur de next.sh.
#
# Un garde qui n'a jamais mordu doit démontrer qu'il sait mordre — et qu'il sait se taire.
# Monte un faux dépôt, tue une fille sans message de limite, et vérifie les quatre verdicts.
# Aucun appel réseau, aucun vrai `claude` : le binaire est un leurre qui laisse une trace.
#
# ⚠️ PAS DE `timeout` ICI. Il n'existe pas sur macOS sans coreutils, et sa première version l'a
# payé cher : les trois contrôles NÉGATIFS étaient verts pour la seule raison que rien ne
# s'exécutait. Un banc dont l'échec ressemble au verdict attendu ne prouve rien. D'où la garde
# `verdict_execute` : chaque cas doit d'abord montrer qu'il a VRAIMENT joué le script.
set -uo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
OK=0; KO=0
verdict() { if [ "$1" = "$2" ]; then echo "  ✅ $3"; OK=$((OK+1)); else echo "  ❌ $3 — attendu «$1», obtenu «$2»"; KO=$((KO+1)); fi; }

cas() { # <nom> <STATE> <derniere ligne du log> <attendu: RELANCE|SILENCE>
  local nom="$1" etat="$2" ligne="$3" attendu="$4" T
  T="$(mktemp -d)"
  ( cd "$T" && git init -q . && git config user.email t@t && git config user.name t \
    && mkdir -p scripts/roadmap bin && : > f && git add f && git commit -qm init ) >/dev/null 2>&1
  printf 'STATE: %s\nCURRENT_STEP: P1\n' "$etat" > "$T/scripts/roadmap/PROGRESS.md"
  echo "prompt de reprise" > "$T/scripts/roadmap/CONTINUATION_PROMPT.md"
  cp "$SKILL/references/roadmap/next.sh" "$T/scripts/roadmap/next.sh"; chmod +x "$T/scripts/roadmap/next.sh"
  # Leurre : il remplace `claude` ET prouve, par sa trace, que le relais est allé jusqu'au bout.
  printf '#!/usr/bin/env bash\ntouch "%s/RELANCE"\nexit 0\n' "$T" > "$T/bin/claude"; chmod +x "$T/bin/claude"
  printf '%s\n' "$ligne" > "$T/fille.log"
  ( sleep 0.1 ) & local MORT=$!; wait "$MORT" 2>/dev/null   # un PID désormais mort

  # Plafond de temps portable : on détache, et on tue au bout de 30 s si ça traîne.
  ( cd "$T" && HOME="$T" PATH="$T/bin:$PATH" ROADMAP_CLAUDE_BIN="$T/bin/claude" \
      ROADMAP_RELAY_GRACE=2 ROADMAP_PERM="" \
      ./scripts/roadmap/next.sh --superviser "$MORT" "$T/fille.log" 2 > "$T/sortie.txt" 2>&1 ) &
  local SUP=$!
  local n=0; while kill -0 "$SUP" 2>/dev/null && [ "$n" -lt 60 ]; do sleep 0.5; n=$((n+1)); done
  kill -9 "$SUP" 2>/dev/null; wait "$SUP" 2>/dev/null

  # GARDE ANTI-FAUX-VERT : le script a-t-il seulement tourné ? Un `command not found` ne doit
  # pas passer pour un « il s'est tu, c'est ce qu'on voulait ».
  if [ ! -f "$T/sortie.txt" ] || grep -qiE "command not found|No such file" "$T/sortie.txt"; then
    echo "  ❌ $nom — le banc n'a pas exécuté le script : $(head -1 "$T/sortie.txt" 2>/dev/null)"
    KO=$((KO+1)); rm -rf "$T"; return
  fi
  local obtenu=SILENCE; [ -f "$T/RELANCE" ] && obtenu=RELANCE
  verdict "$attendu" "$obtenu" "$nom"
  rm -rf "$T"
}

echo "── contre-épreuve : le superviseur reprend-il une mort inopinée ?"
cas "chute en plein step, STATE RUNNING → REPREND" \
    RUNNING "L'audit est toujours en cours. J'attends sa sortie reelle." RELANCE
echo "── contrôles négatifs : sait-il se taire ?"
cas "STATE DONE → ne reprend pas"    DONE    "L'audit est toujours en cours." SILENCE
cas "STATE BLOCKED → ne reprend pas" BLOCKED "Bloque faute d'acces reseau."   SILENCE
cas "STATE STOPPED → ne reprend pas" STOPPED "Arret demande."                 SILENCE

echo; echo "  $OK ok · $KO ko"
[ "$KO" -eq 0 ]
