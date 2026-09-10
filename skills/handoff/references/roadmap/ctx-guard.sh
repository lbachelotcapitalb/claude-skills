#!/usr/bin/env bash
# ctx-guard.sh — DIT À LA SESSION SI ELLE DOIT PASSER LA MAIN MAINTENANT.
#
# Le kit roadmap sait faire « 1 step = 1 session ». Ça suppose qu'un step tient
# toujours dans une fenêtre — faux dès qu'un step est gros (lire 600 Ko de JSX)
# ou au contraire minuscule (on gaspille une session entière). Ce garde mesure le
# contexte RÉEL de la session courante et rend un verdict.
#
# Comment il mesure : Claude Code expose CLAUDE_CODE_SESSION_ID et écrit la
# transcription vivante sous ~/.claude/projects/<slug>/<session-id>.jsonl. Chaque
# message d'assistant y porte son `usage`. Le contexte courant est la somme, sur
# la DERNIÈRE entrée qui en porte un, de :
#   input_tokens + cache_read_input_tokens + cache_creation_input_tokens
# (le cache lu compte : il occupe la fenêtre, il n'est simplement pas refacturé).
#
# Sortie : une ligne « CTX <tokens> / <seuil> -> OK|HANDOFF », et un code retour
#   0 = continue    10 = passe la main
# Le script ne DÉCIDE rien d'autre et n'écrit rien : c'est le prompt de reprise
# qui, sur HANDOFF, pose le checkpoint intra-step puis appelle next.sh.
#
# Réglage : ROADMAP_CTX_MAX (défaut 140000). Sur une fenêtre de 200k, 140k laisse
# ~60k de marge pour finir proprement la sous-tâche en cours, écrire le
# checkpoint, committer et relancer — c'est cette marge qui compte, pas le seuil.
set -euo pipefail

SEUIL="${ROADMAP_CTX_MAX:-140000}"

if [ -z "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  echo "CTX inconnu (CLAUDE_CODE_SESSION_ID absent) -> OK"; exit 0
fi

F="$(ls -t "$HOME"/.claude/projects/*/"${CLAUDE_CODE_SESSION_ID}".jsonl 2>/dev/null | head -1 || true)"
if [ -z "$F" ]; then
  echo "CTX inconnu (transcription introuvable) -> OK"; exit 0
fi

CTX="$(node -e '
const fs=require("fs");
let last=null;
for (const l of fs.readFileSync(process.argv[1],"utf8").split("\n")) {
  if (!l) continue;
  try { const u=JSON.parse(l)?.message?.usage; if (u) last=u; } catch(e) {}
}
if (!last) { console.log(0); process.exit(0); }
console.log((last.input_tokens||0)+(last.cache_read_input_tokens||0)+(last.cache_creation_input_tokens||0));
' "$F")"

if [ "$CTX" -ge "$SEUIL" ]; then
  echo "CTX $CTX / $SEUIL -> HANDOFF"; exit 10
fi
echo "CTX $CTX / $SEUIL -> OK"; exit 0
