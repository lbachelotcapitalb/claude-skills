#!/usr/bin/env bash
# check-update.sh — dit si une version plus récente de CE skill est publiée.
#
# Contrat : UNE seule requête, 3 s maximum, jamais d'échec fatal. Ce contrôle est un
# service rendu au passage, pas une étape du travail : s'il n'aboutit pas (hors ligne,
# portail captif, dépôt déplacé), il le dit en une ligne et rend 0. Un skill qui refuse
# de travailler parce qu'il n'a pas pu se comparer à son dépôt serait pire que périmé.
#
# Le fichier VERSION du dossier est la SEULE source de vérité (pas le frontmatter) :
# deux copies d'un même numéro divergent en silence, et c'est le plus petit objet qu'on
# puisse aller chercher à distance.
#
# Réglages (facultatifs, par variable d'environnement) :
#   SKILL_UPDATE_CHECK=off      désactive le contrôle
#   SKILL_UPDATE_REPO=<base>    pointe une autre base raw (fork, miroir, test local file://)
set -u

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="$(basename -- "$DIR")"
RAW="${SKILL_UPDATE_REPO:-https://raw.githubusercontent.com/lbachelotcapitalb/leo-bachelot-ia-skills/main}"
WEB="https://github.com/lbachelotcapitalb/leo-bachelot-ia-skills"
SEMVER='^[0-9]+\.[0-9]+\.[0-9]+$'

if [ "${SKILL_UPDATE_CHECK:-on}" = "off" ]; then
  echo "$NAME : contrôle de version désactivé (SKILL_UPDATE_CHECK=off)"; exit 0
fi

LOCAL="$(tr -d '[:space:]' < "$DIR/VERSION" 2>/dev/null || true)"
if ! [[ "$LOCAL" =~ $SEMVER ]]; then
  echo "$NAME : pas de fichier VERSION lisible — contrôle impossible"; exit 0
fi

REMOTE="$(curl -fsSL --max-time 3 "$RAW/skills/$NAME/VERSION" 2>/dev/null | tr -d '[:space:]' || true)"
# Ce qui revient du réseau est une DONNÉE non fiable : page d'erreur, HTML de 404, portail
# d'hôtel. Tout ce qui n'est pas un semver nu est traité comme « injoignable » et n'est
# JAMAIS réaffiché — un contrôle de version ne doit pas devenir un canal d'affichage.
if ! [[ "$REMOTE" =~ $SEMVER ]]; then
  echo "$NAME : contrôle indisponible (hors ligne ?) — version locale $LOCAL"; exit 0
fi

if [ "$REMOTE" = "$LOCAL" ]; then
  echo "$NAME : à jour ($LOCAL)"
elif [ "$(printf '%s\n%s\n' "$LOCAL" "$REMOTE" | sort -V | tail -1)" = "$REMOTE" ]; then
  echo "$NAME : NOUVELLE VERSION publiée — $LOCAL → $REMOTE"
  echo "  ce qui change : $WEB/blob/main/skills/$NAME/CHANGELOG.md"
  echo "  mettre à jour : t=\$(mktemp -d) && git clone -q --depth 1 $WEB.git \"\$t\" && cp -R \"\$t/skills/$NAME/.\" \"$DIR/\" && rm -rf \"\$t\""
else
  echo "$NAME : copie locale en avance ($LOCAL > $REMOTE) — c'est la source de publication"
fi
