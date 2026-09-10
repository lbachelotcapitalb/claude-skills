# §6 — Restituer : le banc de démonstration + la page HTML commune

## Sommaire

- 6.1 Monter la branche TELLE QUELLE — surtout ne pas merger
- 6.2 Isoler de la production — non négociable
- 6.3 Un dossier fictif, sinon les écrans sont vides
- 6.4 Capturer
- 6.5 Assembler la page — l'outillage est fourni, ne pas le réécrire


Un tableau de défauts dit ce qui cloche ; il ne dit pas **ce que la contribution apporte**.
Quand le mainteneur demande à voir (« fais-moi un HTML », « montre-moi ce que ça donne »), la réponse
n'est ni un tableau ni une maquette : c'est **sa branche qui tourne, capturée**. Une capture
inventée serait un mensonge sur un travail qu'on s'apprête à juger.

### 6.1 Monter la branche TELLE QUELLE — surtout ne pas merger
Pour *montrer*, on n'a besoin d'aucune fusion. Un worktree en detached sur sa branche évite
d'un coup tous les conflits (17 blocs sur un cas réel) :
```bash
git worktree add -f ../<repo>-<collab> <collab>/<branche>   # detached, aucun merge
cd ../<repo>-<collab> && npm install
```

### 6.2 Isoler de la production — non négociable
Le worktree n'hérite pas du `.env` (gitignoré), donc l'app affichera son écran « config
manquante ». La tentation est de copier le vrai `.env` : **jamais**. Une branche de collab
peut bumper `SCHEMA_VERSION` et l'autosave réécrira des données réelles dans le
nouveau format. Deux gestes (adapter les noms de variables à ceux du repo) :
```bash
cat > .env <<'EOF'
<PREFIX>_API_URL=http://127.0.0.1:9         # port fermé → échec immédiat, pas de timeout
<PREFIX>_API_KEY=demo-non-fonctionnelle
<PREFIX>_DEMO_LOCAL=1
EOF
```
puis, dans le worktree seulement, un court-circuit gardé par `DEMO_LOCAL` : le fournisseur d'auth
rend une session factice, l'effet de chargement injecte un dossier fictif, **et l'effet
d'autosave sort en premier** (`if (DEMO_LOCAL) return;`). Commenter ces patchs comme jetables.

### 6.3 Un dossier fictif, sinon les écrans sont vides
Un dossier vierge affiche 0 € partout : illisible et sans intérêt. Écrire un `src/demoState.js`
**partiel** — la fonction `migrate()` de l'app le fusionne sur `defaultState()`, inutile de
reconstruire tout le schéma. Trois pièges :
- **Les modules filtrent leurs items.** Un élément n'apparaît pas parce qu'un drapeau manque
  (`<module>Active`). Lire le collecteur (`isActive`, `aggregate*`) et les champs
  réellement consommés par le module de calcul — ne pas deviner les noms.
- **Certains onglets sont gatés `isAdmin`.** Passer le profil démo en `admin` pour les voir…
  mais l'app atterrit alors sur l'écran d'administration, vide sans backend : forcer l'onglet
  initial sur l'écran de synthèse en mode démo.
- **Fabriquer le cas qui fait apparaître le défaut.** C'est le vrai gain du banc : une donation
  datée hors du délai de rappel a transformé « le filtre des 15 ans semble absent » (lecture de
  code) en « l'app affiche 65 000 € au lieu de 60 000 » (preuve à l'écran, chiffrable).

### 6.4 Capturer
Le navigateur intégré **n'écrit pas de fichier** ; Playwright si, mais il est confiné à des
racines autorisées (le cwd de la session et `.playwright-mcp/`) — viser le scratchpad échoue.
Naviguer entre onglets sans dépendre des coordonnées :
```js
window.__nav = (l) => { const b=[...document.querySelectorAll('button')]
  .find(x=>x.textContent.trim().replace(/^[^\p{L}]+/u,'')===l); if(b){b.click();window.scrollTo(0,0);} };
```
`fullPage: true` pour un écran dense, viewport + `scrollIntoView` pour cadrer un bloc précis.

### 6.5 Assembler la page — l'outillage est fourni, ne pas le réécrire
Les PNG pleine page pèsent ~500 ko pièce → un HTML de 6 Mo. On les réduit (JPEG, largeur
1240) et on les inline en `data:` URI, pour une page autonome ouvrable sans serveur. Le
template porte des marqueurs `__IMG_01__…` qu'un script substitue : c'est ce qui permet de
retoucher le texte et de reconstruire, sans jamais manipuler 2 Mo de base64 à la main.

```bash
S=~/.claude/skills/review-contrib/references
cp $S/page-revue.template.html ./revue.template.html   # squelette : CSS + structure + zoom au clic
# … remplir le contenu, garder les marqueurs __IMG_xx__ …
node $S/build-page.mjs ./captures ./revue.template.html ~/Desktop/revue-<collab>.html
```
Les captures sont appariées **par ordre alphabétique** (`01-*.png` → `__IMG_01__`) : d'où le
préfixe numérique au moment de capturer. Le script signale les marqueurs d'image non
substitués et les placeholders de texte encore vides — lire sa sortie, c'est la seule chose
qui rattrape un « __POURQUOI__ » laissé dans un document qu'on s'apprête à donner.

**UNE seule page, adressée au contributeur, que le mainteneur lit par-dessus son épaule.** C'est la forme
arbitrée après avoir essayé la version « une page pour lui, une pour l'autre » :
deux pages qui racontent la même chose divergent au premier correctif, et le mainteneur n'a pas de raison de
lire un résumé de ce qu'il va de toute façon envoyer. Écrire à la 2ᵉ personne (« ta branche »),
et étiqueter explicitement le peu qui relève de la décision interne.

Il reste **deux** documents, pas trois : cette page (les deux humains) et le rapport technique du
§9.3 (le contributeur et son IA).

**C'est un tableau de bord, pas un rapport.** Une page qu'on parcourt en diagonale — viser
~6 000 px de haut, pas 30 000. Fond **blanc**, couleur réservée aux **voyants** (rouge / orange /
vert) : sur un écran chargé, c'est la pastille qu'on lit, pas le paragraphe. Le code, les correctifs
et les tests **sortent de cette page** : ils n'ont qu'un lecteur utile, l'IA qui corrigera (§9.3).

Le piège à éviter : croire qu'exhaustif = utile. Un document où tout est écrit ne se lit pas, donc
ne décide rien.

Ce que la page doit porter, dans cet ordre :
1. **Verdict en tête** — fusionnable ou non, et pourquoi en une phrase. Le formuler sur le travail,
   jamais sur la personne : « le problème n'est pas ta façon de coder, c'est l'écart de base ».
2. **Une rangée de voyants** — 4 à 6 cartes : valeur apportée, sécurité, fraîcheur de branche,
   exactitude métier, filet de tests. Chacune : un état en 3 mots + une ligne d'explication.
   Ça remplace les compteurs bruts (commits, fichiers), qui ne se hiérarchisent pas.
3. **« En 30 secondes »** — 4 phrases numérotées. Qui ne lit que ça doit pouvoir trancher.
4. **Ce qui est retenu / ce qui se recoupe** — un tableau, une ligne par module, avec le voyant qui
   tranche. Décrire chaque module par **ce qu'il fait en clientèle**, pas par son API.
5. **Les recouvrements triés** (§2ter) — les apports `A<n>` à conserver, les régressions à écarter.
   Ne jamais écrire « déjà fait, à droper » sans avoir confronté : c'est l'erreur qui jette du
   travail utile, et le contributeur la voit immédiatement.
6. **Ce qu'il ne peut pas deviner depuis son fork** — la version courte de §9.3 : les constantes qui
   ont changé, les API que `main` attend, la liste de tests. Utile aux deux : c'est aussi ce qui
   explique le problème au mainteneur.
7. **Le vocabulaire employé** — une ligne par terme métier, en français, sans article de loi en
   titre. C'est ce qui rend la page relisable dans six mois, ou par quelqu'un d'autre.
8. **Le tableau des défauts, en clair** : voyant · référence stable (`B1`) · ce qui se passe en une
   phrase sans jargon · **ce que ça coûte** en euros ou en risque. Le `fichier:ligne` en sous-titre
   discret, pour qu'il s'y rende. Pas de colonne « correctif » : elle vit dans le rapport technique.
9. **La preuve mesurée** — le calcul attendu vs affiché, quand le banc a fait sortir un défaut.
10. **Les captures en vignettes** cliquables : elles prouvent que ça tourne, elles ne portent pas
    l'argumentation. Zoom au clic obligatoire — réduites, les chiffres ne se lisent pas.
11. **L'ordre de travail** en 4-5 étapes, et **le critère de sortie** (§9.4) annoncé d'avance :
    sans critère écrit, la boucle ne se ferme jamais et personne ne sait ce qu'on attend.
12. **Un encart de fin** : les zones à ne pas toucher (§2bis), le rappel que plusieurs points sont
    discutables, et l'état d'envoi (rien n'est parti tant que le mainteneur n'a pas dit oui).

Un défaut ne se raconte pas par sa cause technique : ce qui compte, c'est **ce que ça coûte** — en
euros quand il fausse un montant, en risque quand il casse autre chose. « La constante est périmée »
ne se hiérarchise pas, « 1 400 € par 100 k€ de plus-value » si.

Le template fourni (`page-revue.template.html`) porte déjà cette forme : fond blanc, rangée de
voyants, tableaux compacts, vignettes. Le remplir, ne pas le refondre.

Livrer le fichier hors du dépôt (`~/Desktop/…`) — c'est un document de travail, pas du code. Et
**vérifier le rendu avant de le donner**. Mesurer plutôt que regarder : un `browser_evaluate` qui
compte les images cassées, les cellules de tableau vides et le débordement horizontal attrape ce que
l'œil laisse passer dans une page de plusieurs milliers de pixels. Servir le fichier en local
(`python3 -m http.server --bind 127.0.0.1`) — Playwright refuse le protocole `file:`.

Dernier contrôle, non négociable puisque la page part chez un tiers :
```bash
grep -nE "~/|/Users/|localhost|127\.0\.0\.1|:5[0-9]{3}|worktree" <la page>   # doit être VIDE
```
