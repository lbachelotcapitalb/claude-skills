# Changelog — contribuer

Le numéro qui fait foi est dans le fichier [`VERSION`](VERSION), à côté de ce fichier.

Ce que veut dire un incrément, **pour un skill** (ce n'est pas une API : ce qui casse, c'est
la manœuvre dans la tête de celui qui l'exécute) :

| Rang | Ce qui change | Ce que ça vous demande |
|---|---|---|
| **MAJEUR** | la manœuvre change, ou une consigne qui était juste devient fausse | relire le skill avant votre prochaine PR |
| **MINEUR** | nouvelle étape, nouveau garde-fou, nouvelle section | à lire quand vous en croisez le cas |
| **CORRECTIF** | précision, reformulation, lien mort, coquille | rien |

---

## 1.0.0 — 2026-08-11

Première version **numérotée**. Le skill existait déjà ; ce qui est neuf, c'est de pouvoir
savoir qu'on en tient une copie périmée.

- **Numérotation + contrôle de version.** `VERSION`, ce changelog, et
  `scripts/check-update.sh` : au chargement, le skill compare sa version locale à celle
  publiée et signale une mise à jour. Une requête, 3 s max, silencieux hors ligne.
- **§5 « Ce que tu ne fais pas ».** Les quatre gestes qui font renvoyer une PR, dits en
  clair plutôt que déduits de la checklist : pousser sur `main`, la PR fourre-tout, la
  grosse dépendance non justifiée, le secret committé.
