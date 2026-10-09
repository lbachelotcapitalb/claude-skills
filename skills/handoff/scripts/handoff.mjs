#!/usr/bin/env node
// handoff.mjs — mécanique git déterministe du skill "handoff".
// Aucune dépendance externe. Toute la config vient de .claude/handoff.json (softcodé).
//
// Sous-commandes :
//   init                       Génère un .claude/handoff.json de départ (interactif léger via flags)
//   out  [--to <remote>] [-m "msg"]   Pousse le WIP sur une branche sûre + imprime la commande de reprise
//   in   [--from <remote>]            Récupère le WIP sur la machine d'arrivée + affiche le HANDOFF
//   status                     Montre branche courante, branche WIP cible, remotes connus
//
// Le script NE déduit jamais rien en dur : pattern de branche, branches protégées,
// hôtes SSH et chemins distants sont tous lus depuis la config du repo.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAP_TPL = join(SKILL_DIR, 'references', 'roadmap');

// ---------- utils ----------
const sh = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
const shLoud = (cmd) => execSync(cmd, { stdio: 'inherit' });
const die = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1); };
const ok = (msg) => console.log(`✅ ${msg}`);
const info = (msg) => console.log(`   ${msg}`);

function parseFlags(argv) {
  const f = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--to' || a === '--from') f[a.slice(2)] = argv[++i];
    else if (a === '-m' || a === '--message') f.message = argv[++i];
    else if (a === '--exec') f.exec = true;
    else if (a === '--ssh') f.ssh = argv[++i];
    else if (a === '--repo') f.repo = argv[++i];
    else if (a === '--path') f.path = argv[++i];
    else if (a === '--task') f.task = argv[++i];
    else if (a === '--max-turns') f['max-turns'] = argv[++i];
    else if (a === '--branch') f.branch = argv[++i];
    else if (a === '--model') f.model = argv[++i];
    else if (a === '--title') f.title = argv[++i];
    else if (a === '--objectif') f.objectif = argv[++i];
    else if (a === '--gate') f.gate = argv[++i];
    else if (a === '--step') f.step = argv[++i];
    else if (a === '--decision') f.decision = argv[++i];
    else if (a === '--repo-path') f['repo-path'] = argv[++i];
    else if (a === '--repo-ssh') f['repo-ssh'] = argv[++i];
    else if (a === '--force') f.force = true;
    else if (a === '--local') f.local = true;
    else if (a === '--every') f.every = argv[++i];
    else if (a === '--label') f.label = argv[++i];
    else if (a === '--no-watch') f['no-watch'] = true;
    else if (a === '--why') f.why = argv[++i];
    else f._.push(a);
  }
  return f;
}

function repoRoot() {
  try { return sh('git rev-parse --show-toplevel'); }
  catch { die('Pas dans un dépôt git.'); }
}

function configPath(root) { return join(root, '.claude', 'handoff.json'); }

function loadConfig(root) {
  const p = configPath(root);
  if (!existsSync(p)) die(`Config absente : ${p}\n   Lance d'abord :  node <skill>/scripts/handoff.mjs init`);
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { die(`Config illisible (${p}) : ${e.message}`); }
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')   // retire les accents
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function gitUser() {
  try { return slug(sh('git config user.name')) || 'user'; }
  catch { return slug(process.env.USER || 'user') || 'user'; }
}

function fillPattern(pattern, root) {
  const repo = root.split('/').pop();
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return pattern
    .replace(/\{repo\}/g, repo)
    .replace(/\{user\}/g, gitUser())
    .replace(/\{date\}/g, date);
}

function resolveRemote(cfg, name) {
  const remotes = cfg.remotes || {};
  const key = name || cfg.defaultRemote || Object.keys(remotes)[0];
  if (!key) return null;
  const r = remotes[key];
  if (!r) die(`Remote "${key}" inconnu. Connus : ${Object.keys(remotes).join(', ') || '(aucun)'}`);
  return { key, ...r };
}

function currentBranch() {
  try { const b = sh('git branch --show-current'); return b || '(aucun commit)'; }
  catch { return '(aucun commit)'; }
}
function branchExists(b) { try { sh(`git rev-parse --verify ${b}`); return true; } catch { return false; } }
function remoteBranchExists(b) { try { return !!sh(`git ls-remote --heads origin ${b}`); } catch { return false; } }

// ---------- init ----------
function cmdInit(root, flags) {
  const p = configPath(root);
  if (existsSync(p) && !flags._.includes('--force')) die(`${p} existe déjà (utilise --force pour écraser).`);
  mkdirSync(join(root, '.claude'), { recursive: true });
  const repo = root.split('/').pop();
  const cfg = {
    wipBranch: 'handoff/wip-{repo}-{user}',
    protectedBranches: ['main', 'master', 'production'],
    noDeployToBranches: ['main', 'master'],
    handoffFile: 'HANDOFF.md',
    defaultRemote: flags.to || 'remote',
    remotes: {
      [flags.to || 'remote']: {
        ssh: flags.ssh || 'user@host',
        path: flags.path || `~/${repo}`,
        claudeBin: 'claude',
        resumePrompt: 'Lis HANDOFF.md à la racine du repo et reprends le travail décrit. Vérifie le build avant de continuer.'
      }
    }
  };
  writeFileSync(p, JSON.stringify(cfg, null, 2) + '\n');
  ok(`Config créée : ${p}`);
  info('Édite-la pour renseigner ssh/path de ta (tes) machine(s) distante(s).');
  info('Astuce : tu peux ajouter plusieurs remotes sous "remotes".');
}

// ---------- guards ----------
function guardBranch(cfg, wip) {
  const prot = new Set([...(cfg.protectedBranches || []), ...(cfg.noDeployToBranches || [])]);
  if (prot.has(wip))
    die(`La branche WIP calculée ("${wip}") est protégée / auto-déployée.\n   Le handoff ne pousse JAMAIS du WIP là-dessus. Change wipBranch dans la config.`);
}

// ---------- coeur partagé : pousser le WIP sur la branche sûre ----------
function ensureWipPushed(root, cfg, wip, message) {
  guardBranch(cfg, wip);
  const handoffFile = cfg.handoffFile || 'HANDOFF.md';
  if (!existsSync(join(root, handoffFile)))
    info(`⚠️  ${handoffFile} introuvable — idéalement le brief (état + prochaines étapes) y est écrit AVANT.`);

  // ⚠️ Sauvegarde NON DESTRUCTIVE — on ne fait JAMAIS `git checkout <wip>`.
  // Bug du 23/06/2026 : l'ancienne version basculait sur la branche WIP (checkout)
  // pour y commiter ; le setup « session nuit » revenait ensuite sur main, laissant
  // le working tree VIDÉ de tout le WIP non commité (il n'existait plus que sur la
  // branche). Désormais : on commite sur la branche COURANTE, on pousse ce commit
  // vers la branche WIP distante, puis on défait le commit local (reset --mixed) →
  // HEAD et working tree reviennent exactement à l'état d'avant, WIP intact et non
  // commité. La branche courante ne change jamais.
  // Compromis assumé : si la machine distante et la locale avancent toutes deux, il
  // faudra merger — bien préférable à perdre du travail local par surprise.
  const branchNow = currentBranch() || '(HEAD détaché)';
  if (!sh('git status --porcelain')) {
    info('Rien à sauvegarder (working tree propre).');
    shLoud(`git push -f origin HEAD:refs/heads/${wip}`);
    ok(`origin/${wip} aligné sur HEAD — branche courante "${branchNow}" inchangée.`);
    return;
  }
  const pre = sh('git rev-parse HEAD');
  shLoud('git add -A');
  const msg = (message || `handoff: WIP ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`).replace(/"/g, '\\"');
  shLoud(`git commit -q -m "${msg}"`);
  // Pousse le commit de snapshot vers la branche WIP distante (force : branche de
  // transport jetable entre machines). La machine distante fait ensuite
  // `git fetch && git checkout <wip>` pour la récupérer.
  shLoud(`git push -f origin HEAD:refs/heads/${wip}`);
  ok(`Poussé sur origin/${wip}`);
  // Restaure : HEAD et working tree exactement comme avant (WIP non commité).
  shLoud(`git reset -q --mixed ${pre}`);
  ok(`Working tree préservé sur "${branchNow}" — WIP non commité, intact.`);
}

// chemin de logs distant (HORS du repo, pour que l'agent ne le commite pas)
function remoteLogDir(root) { return `~/.handoff/${root.split('/').pop()}`; }
function shEsc(s) { return s.replace(/'/g, "'\\''"); }

// ---------- out (départ — reprise manuelle) ----------
function cmdOut(root, cfg, flags) {
  const wip = fillPattern(cfg.wipBranch || 'handoff/wip-{repo}-{user}', root);
  const remote = resolveRemote(cfg, flags.to);
  ensureWipPushed(root, cfg, wip, flags.message);

  if (remote) {
    const rp = shEsc(remote.resumePrompt || 'Lis HANDOFF.md et reprends le travail.');
    const claudeBin = remote.claudeBin || 'claude';
    const remoteCmd = `cd ${remote.path} && git fetch origin && git checkout ${wip} && git pull --ff-only && ${claudeBin} '${rp}'`;
    const sshCmd = `ssh -t ${remote.ssh} "${remoteCmd}"`;
    console.log('\n────────────────────────────────────────────');
    console.log(`📦 Reprendre sur "${remote.key}" (${remote.ssh}) — copie/colle :\n`);
    console.log('  ' + sshCmd + '\n');
    console.log('  Ou, depuis un shell déjà sur la machine distante :');
    console.log(`  ${remoteCmd}`);
    console.log('────────────────────────────────────────────\n');
    if (flags.exec) { info('--exec : lancement SSH…'); shLoud(sshCmd); }
  } else {
    console.log(`\n📦 Sur l'autre machine :  git fetch && git checkout ${wip} && git pull --ff-only\n`);
  }
}

// ---------- delegate (départ — exécution AUTONOME headless sur le VPS) ----------
function cmdDelegate(root, cfg, flags) {
  const task = flags.task || flags.message;
  if (!task) die('Précise la tâche : --task "ce que le VPS doit faire de façon autonome".');
  const wip = fillPattern(cfg.wipBranch || 'handoff/wip-{repo}-{user}', root);
  const remote = resolveRemote(cfg, flags.to);
  if (!remote) die('Aucun remote configuré (remotes / defaultRemote dans .claude/handoff.json).');

  // 1) brief versionné + push du WIP
  const handoffFile = cfg.handoffFile || 'HANDOFF.md';
  writeFileSync(join(root, handoffFile),
    `# HANDOFF — tâche déléguée au VPS\n\n**Tâche** : ${task}\n\n**Consigne** : exécuter de façon autonome sur la branche \`${wip}\`, puis commiter et pousser.\n`);
  ensureWipPushed(root, cfg, wip, flags.message || `delegate: ${task}`.slice(0, 72));

  // 2) prompt autonome
  const claudeBin = remote.claudeBin || 'claude';
  const dflags = remote.delegateFlags || '--allowedTools "Bash,Read,Write,Edit,Glob,Grep" --permission-mode acceptEdits';
  const maxTurns = ` --max-turns ${flags['max-turns'] || 40}`;
  const prompt = [
    `Tu es sur le VPS, dans un clone du repo, sur la branche git \`${wip}\`. Travaille de façon AUTONOME (aucun humain ne répondra).`,
    ``,
    `TÂCHE :`,
    task,
    ``,
    `CONSIGNES :`,
    `- Lis HANDOFF.md pour le contexte. Respecte les conventions du repo (CLAUDE.md s'il existe).`,
    `- Ne touche JAMAIS à la branche main. Reste sur \`${wip}\`.`,
    `- Quand tu as fini : commite avec un message clair puis « git push origin ${wip} ».`,
    `- Si tu te bloques ou t'arrêtes en cours : écris l'état restant dans HANDOFF.md, commite et pousse quand même.`
  ].join('\n');

  // 3) lancement détaché sur le VPS (survit à la déconnexion SSH)
  const logDir = remoteLogDir(root);
  const remoteScript = [
    `set -e`,
    `mkdir -p ${logDir}`,
    `cd ${remote.path}`,
    `git fetch -q origin && git checkout -qB ${wip} origin/${wip}`,  // clone jetable : force la branche locale = origin/wip
    `cat > ${logDir}/task.txt <<'HANDOFF_TASK'`,
    prompt,
    `HANDOFF_TASK`,
    `TS=$(date +%Y%m%d-%H%M%S)`,
    `LOG=${logDir}/run-$TS.log`,
    // UNE DÉLÉGATION QUI FINIT EN SILENCE N'EST PAS FINIE. Avant le 15/08/2026, l'agent
    // travaillait puis se taisait : il fallait penser à `delegate-status`, donc se souvenir
    // qu'on avait délégué. On enveloppe donc la session dans un shell qui SURVIT à sa mort et
    // envoie une ligne Minder — succès ou échec, jamais rien d'autre à faire pour l'apprendre.
    // Le verdict vient du CODE DE SORTIE, pas d'une lecture du log : un agent qui rend un beau
    // compte rendu après un échec ne doit pas pouvoir se déclarer vainqueur.
    `cat > ${logDir}/run-wrapper.sh <<'HANDOFF_WRAP'`,
    `#!/usr/bin/env bash`,
    `LOG="$1"; TASK="$2"; BRANCHE="$3"; REPO="$4"`,
    // IDENTITÉ. Ce VPS n'a PAS de ~/.claude/.credentials.json : son jeton vit dans un
    // fichier d'ENV (`authEnvFile` du remote). Sans ce sourcing, `claude -p` répond
    // « Not logged in · Please run /login » et meurt en 35 octets — constaté le
    // 09/09/2026. Le mode roadmap le faisait déjà ; delegate l'avait oublié.
    ...(remote.authEnvFile ? [`[ -f "${remote.authEnvFile}" ] && { set -a; . "${remote.authEnvFile}"; set +a; }`] : []),
    `"$5" -p "$(cat "$TASK")" ${dflags}${maxTurns} >"$LOG" 2>&1 </dev/null`,
    `CODE=$?`,
    `DERNIERE="$(grep -v '^[[:space:]]*$' "$LOG" 2>/dev/null | tail -1 | cut -c1-220)"`,
    `if [ "$CODE" = "0" ]; then MSG="✅ handoff « $REPO » ($(hostname -s)) — délégation TERMINÉE sur $BRANCHE. $DERNIERE"`,
    `else MSG="❌ handoff « $REPO » ($(hostname -s)) — délégation BLOQUÉE (code $CODE) sur $BRANCHE. $DERNIERE"; fi`,
    `SEND="${'${MINDER_SEND:-$HOME/.config/minder/send.sh}'}"`,
    `[ -x "$SEND" ] && "$SEND" "$MSG" >/dev/null 2>&1`,
    `echo "$(date -u '+%F %T UTC') | $MSG" >> "$(dirname "$LOG")/notify.log"`,
    `HANDOFF_WRAP`,
    `chmod +x ${logDir}/run-wrapper.sh`,
    // Le chemin du prompt part en ARGUMENT QUOTÉ à l'enveloppe : un `~` entre guillemets
    // n'est pas développé par le shell, `cat` échouait, et `claude -p ""` refusait avec
    // « Input must be provided… » — 94 octets de log et une ligne Minder ❌ pour une tâche
    // jamais lue (09/09/2026). On développe le tilde AVANT de quoter.
    `TASKF=${logDir}/task.txt`,
    // Détachement réel : `setsid` place l'enveloppe dans son propre groupe, sinon elle meurt
    // avec la session SSH — et la notification de fin meurt avec elle.
    `setsid nohup bash ${logDir}/run-wrapper.sh "$LOG" "$TASKF" "${wip}" "${root.split('/').pop()}" "${claudeBin}" >>${logDir}/wrapper.out 2>&1 </dev/null &`,
    `echo $! > ${logDir}/run.pid`,
    `echo "PID=$(cat ${logDir}/run.pid)"`,
    `echo "LOG=$LOG"`
  ].join('\n');

  console.log(`\n🤖 Délégation autonome → "${remote.key}" (${remote.ssh}), branche ${wip}`);
  const outp = sh(`ssh -o BatchMode=yes ${remote.ssh} 'bash -s'`, { input: remoteScript });
  console.log(outp);
  ok('Agent lancé sur le VPS (détaché). Il commitera/poussera son résultat sur la branche.');
  info('Une ligne Minder partira à la fin — ✅ si la session sort en 0, ❌ sinon. Rien à surveiller.');
  console.log(`\n   Suivre :   node <skill>/scripts/handoff.mjs delegate-status --to ${remote.key}`);
  console.log(`   Récupérer une fois fini :  git fetch && git checkout ${wip}\n`);
}

// ---------- delegate-status (surveillance) ----------
function cmdDelegateStatus(root, cfg, flags) {
  const wip = fillPattern(cfg.wipBranch || 'handoff/wip-{repo}-{user}', root);
  const remote = resolveRemote(cfg, flags.to);
  if (!remote) die('Aucun remote configuré.');
  const logDir = remoteLogDir(root);
  const remoteScript = [
    `cd ${remote.path} 2>/dev/null || exit 0`,
    `PID=$(cat ${logDir}/run.pid 2>/dev/null || echo "")`,
    `if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then echo "ÉTAT: EN COURS (pid $PID)"; else echo "ÉTAT: TERMINÉ"; fi`,
    `LOG=$(ls -t ${logDir}/run-*.log 2>/dev/null | head -1)`,
    `echo "--- dernières lignes du log ($LOG) ---"; tail -n 15 "$LOG" 2>/dev/null`,
    `echo "--- derniers commits sur ${wip} ---"; git log --oneline -5 ${wip} 2>/dev/null`
  ].join('\n');
  const outp = sh(`ssh -o BatchMode=yes ${remote.ssh} 'bash -s'`, { input: remoteScript });
  console.log(outp);
}

// ---------- in (arrivée) ----------
function cmdIn(root, cfg, flags) {
  // si --from désigne un remote, on en déduit juste la branche WIP (même pattern, même user attendu)
  const wip = flags._[1] && flags._[1].includes('/')
    ? flags._[1]
    : fillPattern(cfg.wipBranch || 'handoff/wip-{repo}-{user}', root);

  if (!remoteBranchExists(wip))
    die(`Branche distante origin/${wip} introuvable.\n   Vérifie le nom (wipBranch) ou que le 'out' a bien poussé.`);

  shLoud('git fetch origin');
  if (currentBranch() !== wip) shLoud(`git checkout ${wip}`);
  shLoud('git pull --ff-only');
  ok(`Repris sur ${wip}`);

  const handoffFile = cfg.handoffFile || 'HANDOFF.md';
  const hp = join(root, handoffFile);
  if (existsSync(hp)) {
    console.log(`\n──────── ${handoffFile} ────────\n`);
    console.log(readFileSync(hp, 'utf8'));
    console.log('────────────────────────────────\n');
  } else {
    info(`Pas de ${handoffFile} dans ce commit.`);
  }
}

// ---------- check (diagnostic des canaux de transmission sur la machine cible) ----------
// Sonde la cible et dit, canal par canal, si les docs/déps de la tâche peuvent y être
// transmis. iCloud est TOUJOURS marqué exclu (pas de client Linux). Produit des préconisations.
function cmdCheck(root, flags) {
  let sshTarget = flags.ssh, label = flags.ssh;
  if (!sshTarget) {
    const remote = resolveRemote(loadConfig(root), flags.to);
    if (!remote) die('Aucune cible : passe --ssh user@host ou configure un remote dans .claude/handoff.json.');
    sshTarget = remote.ssh; label = remote.key;
  }
  // repo de la tâche : la cible peut-elle le récupérer ? (origin du repo courant par défaut)
  let originUrl = flags.repo || '';
  if (!originUrl) { try { originUrl = sh('git remote get-url origin'); } catch {} }

  const probe = [
    `emit(){ printf '%s=%s\\n' "$1" "$2"; }`,
    `command -v git >/dev/null && emit GIT "$(git --version 2>/dev/null | awk '{print $3}')" || emit GIT absent`,
    `if command -v gh >/dev/null; then gh auth status >/dev/null 2>&1 && emit GH ok || emit GH unauth; else emit GH absent; fi`,
    `git ls-remote https://github.com/git/git.git HEAD >/dev/null 2>&1 && emit GITHUB_NET ok || emit GITHUB_NET ko`,
    // -n : stdin depuis /dev/null, sinon ce ssh (s'il s'authentifie) avale le reste du script lu par « bash -s »
    `ssh -n -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -T git@github.com >/dev/null 2>&1; [ $? -eq 1 ] && emit GITHUB_SSH ok || emit GITHUB_SSH denied`,
    originUrl
      ? `git ls-remote ${JSON.stringify(originUrl)} HEAD >/dev/null 2>&1 && emit REPO_ACCESS ok || emit REPO_ACCESS ko`
      : `emit REPO_ACCESS skip`,
    `if command -v supabase >/dev/null; then emit SUPABASE_CLI "$(supabase --version 2>/dev/null | head -1)"; else emit SUPABASE_CLI absent; fi`,
    `curl -s -o /dev/null --max-time 8 https://api.supabase.com && emit SUPABASE_NET ok || emit SUPABASE_NET ko`,
    `if command -v netlify >/dev/null; then emit NETLIFY_CLI "$(netlify --version 2>/dev/null | head -1)"; else emit NETLIFY_CLI absent; fi`,
    `curl -s -o /dev/null --max-time 8 https://api.netlify.com && emit NETLIFY_NET ok || emit NETLIFY_NET ko`,
    `if command -v rclone >/dev/null; then emit RCLONE present; emit RCLONE_REMOTES "$(rclone listremotes 2>/dev/null | paste -sd, -)"; else emit RCLONE absent; emit RCLONE_REMOTES ""; fi`,
    `command -v bw >/dev/null && emit BW present || emit BW absent`,
    `command -v node >/dev/null && emit NODE "$(node --version 2>/dev/null)" || emit NODE absent`
  ].join('\n');

  let raw;
  try { raw = sh(`ssh -o BatchMode=yes -o ConnectTimeout=10 ${sshTarget} 'bash -s'`, { input: probe }); }
  catch (e) { die(`Impossible de joindre ${sshTarget} en SSH (BatchMode).\n   ${(e.stderr || e.message || '').toString().trim()}`); }
  const m = {};
  raw.split('\n').forEach(l => { const i = l.indexOf('='); if (i > 0) m[l.slice(0, i)] = l.slice(i + 1); });

  const Y = '✅', W = '⚠️ ', N = '❌';
  console.log(`\n🔍 Canaux de transmission — cible « ${label} » (${sshTarget})\n`);
  const line = (icon, name, detail) => console.log(`  ${icon} ${name.padEnd(24)} ${detail}`);

  if (m.REPO_ACCESS === 'ok') line(Y, 'GitHub — ce repo', 'récupérable (git ls-remote OK)');
  else if (m.REPO_ACCESS === 'ko') line(N, 'GitHub — ce repo', `INACCESSIBLE — ${originUrl} (clé/credential manquant)`);
  else line(W, 'GitHub — ce repo', 'non testé (pas d\'origin local)');
  line(m.GITHUB_NET === 'ok' ? Y : N, 'GitHub — réseau', m.GITHUB_NET === 'ok' ? 'joignable' : 'injoignable');
  line(m.GITHUB_SSH === 'ok' ? Y : W, 'GitHub — clé SSH gén.', m.GITHUB_SSH === 'ok' ? 'authentifiée' : 'pas de clé git@github.com générale');
  line(m.GH === 'ok' ? Y : W, 'gh CLI', m.GH === 'ok' ? 'authentifié' : (m.GH === 'unauth' ? 'présent, non authentifié' : 'absent'));
  line(m.SUPABASE_NET === 'ok' ? Y : N, 'Supabase — réseau', m.SUPABASE_NET === 'ok' ? 'joignable' : 'injoignable');
  line(m.SUPABASE_CLI && m.SUPABASE_CLI !== 'absent' ? Y : W, 'Supabase — CLI', m.SUPABASE_CLI && m.SUPABASE_CLI !== 'absent' ? m.SUPABASE_CLI : 'absent (clés via .env du projet)');
  line(m.NETLIFY_NET === 'ok' ? Y : N, 'Netlify — réseau', m.NETLIFY_NET === 'ok' ? 'joignable' : 'injoignable');
  line(m.NETLIFY_CLI && m.NETLIFY_CLI !== 'absent' ? Y : W, 'Netlify — CLI', m.NETLIFY_CLI && m.NETLIFY_CLI !== 'absent' ? m.NETLIFY_CLI : 'absent (deploy via merge sur main)');
  const remotes = (m.RCLONE_REMOTES || '').trim();
  if (m.RCLONE === 'present') line(remotes ? Y : W, 'Google Drive (rclone)', remotes ? `remotes: ${remotes}` : 'rclone présent, aucun remote');
  else line(N, 'Google Drive (rclone)', 'rclone absent — pas de Drive monté');
  line(m.BW === 'present' ? Y : W, 'Bitwarden CLI', m.BW === 'present' ? 'présent' : 'absent (secrets via .env locaux)');
  line(m.NODE && m.NODE !== 'absent' ? Y : N, 'node (handoff.mjs)', m.NODE && m.NODE !== 'absent' ? m.NODE : 'absent');
  line(N, 'iCloud', 'non supporté sur Linux — relocalise les docs (git / bucket / Drive)');

  const rec = [];
  if (m.REPO_ACCESS === 'ko')
    rec.push(`Repo INACCESSIBLE côté cible : le « in » échouera. Ajoute une deploy key (ssh-keygen + alias dans ~/.ssh/config + clé sur le repo GitHub) OU installe gh puis « gh auth login ».`);
  if (m.RCLONE === 'absent')
    rec.push(`Si la tâche dépend de fichiers Google Drive : installe rclone (« curl https://rclone.org/install.sh | sudo bash ») + « rclone config » ; sinon relocalise ces docs dans le repo ou un bucket (Supabase Storage / R2).`);
  if (m.SUPABASE_CLI === 'absent')
    rec.push(`Migrations Supabase : « npm i -g supabase » sur la cible, ou applique-les via le .env du projet déjà présent.`);
  if (m.BW === 'absent')
    rec.push(`Pas de Bitwarden CLI sur la cible : les secrets doivent venir des .env déjà déposés, pas du coffre.`);
  rec.push(`iCloud n'est jamais un canal vers ce serveur : tout doc « iCloud-only » doit être relocalisé AVANT le handoff.`);

  console.log(`\n📋 Préconisations :`);
  rec.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  console.log('');
}

// ---------- status ----------
function cmdStatus(root, cfg) {
  const wip = fillPattern(cfg.wipBranch || 'handoff/wip-{repo}-{user}', root);
  console.log(`repo        : ${root.split('/').pop()}  (${root})`);
  console.log(`branche     : ${currentBranch()}`);
  console.log(`WIP cible   : ${wip}  ${remoteBranchExists(wip) ? '(existe sur origin)' : '(pas encore poussée)'}`);
  console.log(`handoffFile : ${cfg.handoffFile || 'HANDOFF.md'}`);
  console.log(`remotes     : ${Object.keys(cfg.remotes || {}).join(', ') || '(aucun)'}`);
  console.log(`default     : ${cfg.defaultRemote || '(aucun)'}`);
}

// ============================================================================
// ROADMAP DRIVER — exécution autonome multi-steps sur le VPS avec AUTO-CONTINUATION.
//
// Modèle (choix l'utilisateur : « auto-continuation », pas de driver tmux) :
//   • Le kit vit DANS le repo, versionné : scripts/roadmap/{PROGRESS.md, CONTINUATION_PROMPT.md, next.sh}.
//   • On itère la roadmap sur le desktop (ici), on commit, on pousse.
//   • `roadmap launch` bootstrappe le repo+branche sur le VPS et démarre la 1re session.
//   • Chaque session fait UN step, commit, MAJ PROGRESS.md, puis appelle next.sh → détache une
//     session `claude -p` FRAÎCHE (Opus + skip-permissions) qui relit CONTINUATION_PROMPT.md.
//   • Chaque passe = une session distincte sous ~/.claude/projects → visible dans cloudcode.
//   • Halt volontaire à STATE = AWAITING_DECISION / BLOCKED / DONE (next.sh ne relance pas).
// ============================================================================

function roadmapCfg(remote) {
  const r = (remote && remote.roadmap) || {};
  return {
    model: r.model || 'opus',
    kitDir: r.kitDir || 'scripts/roadmap',
    progressFile: r.progressFile || 'scripts/roadmap/PROGRESS.md',
    promptFile: r.promptFile || 'scripts/roadmap/CONTINUATION_PROMPT.md',
    nextFile: r.nextFile || 'scripts/roadmap/next.sh',
  };
}
// URL cloudcode d'affichage (softcodée : remote.cloudcodeUrl, sinon rien).
function cloudcodeUrl(remote) { return remote && remote.cloudcodeUrl; }

// Petite exécution SSH en shell de LOGIN (indispensable : ~/.profile met claude sur le PATH
// et exporte CLAUDE_CODE_OAUTH_TOKEN, hérité par la session détachée).
function sshLogin(sshTarget, script) {
  return sh(`ssh -o BatchMode=yes -o ConnectTimeout=12 ${sshTarget} 'bash -ls'`, { input: script });
}

// ---------- MODE LOCAL (--local) : la chaîne autonome tourne sur CETTE machine ----------
// Pourquoi ce mode existe. Le driver a été écrit VPS-first, pour que le propriétaire suive depuis son
// téléphone. Mais le mécanisme lui-même — une session qui fait un step puis en détache une
// FRAÎCHE — ne doit rien au VPS : il ne demande qu'un `claude` authentifié et un dépôt git.
// Sur le poste de travail, ça évite le clone, la latence SSH et la resynchro, et surtout ça
// laisse la chaîne travailler sur le dépôt RÉEL au lieu d'un cache.
//
// UNE différence de doctrine, et elle est structurante : sur le VPS, le dossier est un CACHE
// JETABLE, donc chaque lancement fait `git reset --hard origin/<branche>`. **En local, jamais.**
// Le dépôt local est la source de vérité — un reset dur y détruirait tout travail non poussé,
// y compris celui d'une autre session. Le mode local se contente de vérifier qu'on est sur la
// bonne branche et que l'arbre est propre.
function runLocal(script, root) {
  return sh(`bash -ls`, { input: script, cwd: root });
}

/** Exécute le script du driver là où la chaîne doit tourner : ici (--local) ou sur le remote. */
function runTarget(remote, script, flags, root) {
  return flags.local ? runLocal(script, root) : sshLogin(remote.ssh, script);
}

/** La cible du driver. En local : un pseudo-remote dont le repoPath EST le dépôt courant. */
function resolveTarget(root, cfg, flags) {
  if (flags.local) {
    return { key: 'local', ssh: null, repoPath: root, roadmap: (cfg && cfg.roadmap) || {} };
  }
  const remote = resolveRemote(cfg, flags.to);
  if (!remote) die('Aucun remote configuré (remotes / defaultRemote dans .claude/handoff.json).\n   Pour faire tourner la chaîne sur CETTE machine : ajoute --local.');
  if (!remote.repoPath) die(`Le remote "${remote.key}" n'a pas de repoPath (chemin du repo sur la cible).`);
  return remote;
}

/** Fragment shell : définit `chaine_pids`, qui liste les sessions de CHAÎNE d'un dépôt.
 *
 *  Pourquoi pas le PID écrit par next.sh. Il a été enregistré comme LA cible fiable, et il ne
 *  l'est pas : le `claude` du PATH est un script d'enveloppe, donc `$!` désigne l'enveloppe et
 *  pas la session qui vit. Constaté le 12/08/2026 — `roadmap.pid` pointait un mort pendant
 *  qu'une session tournait dans le dépôt. `status` annonçait « chaîne arrêtée » sur une chaîne
 *  qui produisait des commits, et surtout `stop` n'aurait tué personne en disant « rien à
 *  arrêter » : l'utilisateur croit avoir coupé, la chaîne continue. Un arrêt qui ment est pire
 *  qu'un arrêt qui échoue bruyamment.
 *
 *  Ce qu'on vise à la place : les process dont la ligne de commande porte `claude -p` ET dont
 *  le répertoire courant EST le dépôt. Le `-p` est ce qui distingue une session de chaîne
 *  (headless) d'une session interactive de l'utilisateur ouverte dans le même dossier — sans
 *  lui, un `stop` emporterait la session depuis laquelle on l'a lancé.
 *  `/proc` n'existe pas sur macOS : `lsof` prend le relais. */
const SH_CHAINE_PIDS = [
  `chaine_pids() {`,
  `  local pid c`,
  `  for pid in $(pgrep -f "claude -p" 2>/dev/null); do`,
  `    if [ -r "/proc/$pid/cwd" ]; then c="$(readlink "/proc/$pid/cwd" 2>/dev/null)"`,
  `    else c="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"; fi`,
  `    [ "$c" = "$1" ] && echo "$pid"`,
  `  done`,
  `}`,
].join('\n');

/** Le chemin du dépôt LUI-MÊME n'est pas un « chemin hors dépôt ».
 *  En mode --local, un kit qui écrit `cd ~/<repo>` se faisait refuser par son propre garde : le
 *  détecteur cherche des chemins absolus, et la racine du dépôt en est un. Un détecteur qui crie
 *  sur sa propre racine est un détecteur qu'on finit par contourner à coups de marqueurs — donc
 *  on le corrige ici plutôt que d'annoter les kits. */
function designeLeDepot(ligne, root) {
  const home = process.env.HOME || '';
  for (const m of ligne.match(/(~\/[^\s`'")]+|\/(?:Users|home)\/[^\s`'")]+)/g) || []) {
    const abs = m.startsWith('~/') ? join(home, m.slice(2)) : m;
    if (abs === root || abs.startsWith(root + '/')) return true;
  }
  return false;
}

/** Config optionnelle : en --local, .claude/handoff.json n'est pas requis (rien à router). */
function loadConfigOptional(root) {
  const p = configPath(root);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

// ---------- roadmap init (scaffolding LOCAL du kit dans le repo) ----------
function cmdRoadmapInit(root, flags) {
  const kitDir = join(root, 'scripts', 'roadmap');
  mkdirSync(kitDir, { recursive: true });

  // next.sh : mécanisme d'auto-continuation. Toujours (re)copié depuis le template du skill.
  const nextDst = join(kitDir, 'next.sh');
  copyFileSync(join(ROADMAP_TPL, 'next.sh'), nextDst);
  // ctx-guard.sh : le garde de fenêtre de contexte. Toujours (re)copié lui aussi —
  // sans lui, le prompt de reprise réclame un verdict que rien ne rend, et la
  // session enchaîne jusqu'à saturer sa fenêtre au milieu d'un step.
  const guardDst = join(kitDir, 'ctx-guard.sh');
  copyFileSync(join(ROADMAP_TPL, 'ctx-guard.sh'), guardDst);
  try { chmodSync(guardDst, 0o755); } catch {}
  try { chmodSync(nextDst, 0o755); } catch {}
  ok(`Écrit scripts/roadmap/next.sh (mécanisme d'auto-continuation).`);

  const subst = (s) => s
    .replace(/\{\{TITRE\}\}/g, flags.title || root.split('/').pop() + ' — roadmap autonome')
    .replace(/\{\{OBJECTIF\}\}/g, flags.objectif || flags.title || 'la roadmap')
    .replace(/\{\{BRANCHE\}\}/g, flags.branch || currentBranch())
    .replace(/\{\{GATE\}\}/g, flags.gate || 'npm run audit')
    .replace(/\{\{PREMIER_STEP\}\}/g, flags.step || 'S1')
    .replace(/\{\{DESCRIPTION\}\}/g, 'décris le premier step')
    .replace(/\{\{AUTRES_TESTS\}\}/g, '(liste les tests/oracle exécutables sur la cible)');

  for (const [tpl, dst, label] of [
    ['PROGRESS.template.md', 'PROGRESS.md', "l'état vivant"],
    ['CONTINUATION_PROMPT.template.md', 'CONTINUATION_PROMPT.md', 'le prompt de reprise'],
  ]) {
    const d = join(kitDir, dst);
    if (existsSync(d) && !flags.force) { info(`scripts/roadmap/${dst} existe déjà — laissé tel quel (--force pour écraser).`); continue; }
    writeFileSync(d, subst(readFileSync(join(ROADMAP_TPL, tpl), 'utf8')));
    ok(`Écrit scripts/roadmap/${dst} (${label}).`);
  }
  console.log('\n   Édite PROGRESS.md (checklist des steps) et CONTINUATION_PROMPT.md, commite, pousse,');
  console.log('   puis :  node <skill>/scripts/handoff.mjs roadmap launch --to <remote>\n');
}

// ---------- roadmap launch (desktop → VPS : bootstrap + démarre la 1re session) ----------
function cmdRoadmapLaunch(root, cfg, flags) {
  const remote = resolveTarget(root, cfg, flags);
  const rc = roadmapCfg(remote);
  const branch = flags.branch || currentBranch();
  const model = flags.model || rc.model;
  const repoSsh = remote.repoSsh || flags['repo-ssh'] || '';

  // Le kit doit exister localement et être commité (il voyage par git).
  if (!existsSync(join(root, rc.nextFile)))
    die(`${rc.nextFile} absent en local. Lance d'abord :  node <skill>/scripts/handoff.mjs roadmap init`);

  // PRÉVOL LOCAL — UN CHEMIN HORS DÉPÔT DANS LE KIT EST UNE CHAÎNE QUI S'ARRÊTERA DESSUS.
  // Le kit voyage par git ; la machine cible ne voit QUE le dépôt. Une roadmap qui désigne sa
  // source de vérité par un chemin du desktop (`~/Documents/…`, `/Users/…`) envoie la session
  // chercher un fichier qui n'existera jamais chez elle. Vécu le 11/08/2026 : la maquette de
  // référence vivait hors git, la 1re session a halté au premier geste — à raison, mais après
  // un aller-retour complet. Ce garde le dit AVANT le lancement, pas trois commits plus tard.
  for (const f of [rc.progressFile, rc.promptFile]) {
    const abs = join(root, f);
    if (!existsSync(abs)) continue;
    // LES BLOCS DE CODE SONT EXCLUS. Un chemin entre ``` est une COMMANDE destinée à la
    // machine cible (« lance ce script depuis ~/.local/… »), pas une source que la session
    // devrait aller lire sur le desktop. Sans cette exclusion le garde se déclenche sur ses
    // propres templates — et un garde qui crie sur du code légitime finit désarmé.
    const lignes = readFileSync(abs, 'utf8').split('\n');
    let dansFence = false;
    const hits = lignes
      .map((l, i) => {
        const estFence = /^\s*```/.test(l);
        const dedans = dansFence || estFence;
        if (estFence) dansFence = !dansFence;
        return { l: dedans ? '' : l, i: i + 1 };
      })
      // ÉCHAPPATOIRE EXPLICITE. Tous les chemins absolus ne sont pas des sources du desktop :
      // certains désignent un fichier SUR LA CIBLE (un `.env`, un fichier d'identifiants qu'elle
      // doit lire). Le garde ne sait pas les distinguer — l'auteur, si. Il l'écrit alors en toutes
      // lettres avec `<!-- cible -->` en fin de ligne. Marqueur explicite et relisible : on ne
      // désarme pas un garde en silence. (Le garde s'est déclenché sur ce cas dès son 2e usage.)
      .filter(({ l }) => /(^|[\s`'"(])(~\/|\/Users\/|\/home\/[a-z]+\/(?!.*\bcache\b))/.test(l)
                      && !/^\s*(#|\/\/)/.test(l)
                      && !/<!--\s*cible\s*-->/.test(l)
                      && !designeLeDepot(l, root));
    if (hits.length) {
      console.error(`\n❌ ${f} désigne des chemins HORS DÉPÔT — la cible ne les verra pas :`);
      for (const { l, i } of hits.slice(0, 6)) console.error(`   ligne ${i} : ${l.trim().slice(0, 110)}`);
      die(`Relocalise ces sources DANS le dépôt (ex. design/, docs/), retire la référence, ou — si le chemin\n   ` +
          `désigne un fichier SUR LA CIBLE — marque la ligne d'un \`<!-- cible -->\` explicite.\n   ` +
          `C'est le point 0 de la doctrine handoff : la cible n'accède qu'à ce que git transporte.`);
    }
  }

  // Pousser la branche sur origin pour que le VPS la récupère (jamais forcé : branche de travail réelle).
  // En local, la cible EST ce dépôt — le push ne transporte rien, il ne sert que de sauvegarde ;
  // on ne meurt donc pas s'il échoue (pas de remote, dépôt hors ligne), on le signale.
  // RELANCER, C'EST REPARTIR DE CE QUE LA CIBLE A POUSSÉ (18/09/2026). Une chaîne qui tourne
  // pousse à chaque step : au bout d'une heure, le clone d'où l'on relance est en retard de
  // vingt commits. Le push partait donc en `! [rejected] (fetch first)` et `launch` mourait en
  // demandant de « résoudre en local » — la relance butait sur sa propre mécanique, au pire
  // moment, celui où la chaîne est déjà à terre. On s'aligne d'abord, en fast-forward SEUL :
  // s'il y a une vraie divergence (du travail local inédit), le ff échoue et on meurt comme
  // avant — c'est un arbitrage humain, pas un cas à forcer.
  info(`Pousse ${branch} sur origin…`);
  try { sh(`git fetch origin ${branch}`); } catch { /* pas de remote / hors ligne : le push tranchera */ }
  try { sh(`git merge --ff-only origin/${branch}`); info(`   aligné en fast-forward sur origin/${branch}`); }
  catch { /* déjà à jour, en avance, ou divergent : le push dira laquelle */ }
  try { shLoud(`git push origin ${branch}`); }
  catch {
    if (!flags.local) die(`git push origin ${branch} a échoué.\n   Le fast-forward sur origin/${branch} n'a pas suffi : la branche locale a des commits que le distant n'a pas ET inversement.\n   Résous la divergence en local (rebase) avant de relancer.`);
    console.error(`   ⚠️  push impossible — la chaîne locale démarrera quand même (elle travaille sur ce dépôt).`);
  }
  // En local, un arbre sale n'est pas un détail : la première session commite ce qu'elle trouve,
  // donc le travail en cours de quelqu'un d'autre partirait dans un commit de roadmap.
  if (flags.local) {
    const dirty = (() => { try { return sh('git status --porcelain'); } catch { return ''; } })();
    if (dirty) die(`L'arbre de travail n'est pas propre — la 1re session commiterait ces fichiers :\n${dirty.split('\n').slice(0, 10).map((l) => '   ' + l).join('\n')}\n   Commite ou remise avant de lancer la chaîne.`);
  }

  const RP = remote.repoPath;
  // Doctrine « tout online » : GitHub = source unique de vérité. Le dossier VPS est un CACHE
  // JETABLE, resynchronisé DUR sur origin à chaque lancement (git reset --hard). Rien de valeur
  // n'y vit jamais seul — chaque step commit+push vers la branche (voir CONTINUATION_PROMPT).
  const script = [
    `set -e`,
    // PRÉVOL DISTANT. Chacune de ces lignes est une panne réellement vécue le 11/08/2026, et
    // chacune était SILENCIEUSE : la chaîne démarrait, puis mourait sans rien dire.
    `case "${RP}" in "~"*) echo "❌ repoPath commence par ~ : le tilde n'est PAS développé côté distant, le clone atterrirait dans un dossier littéralement nommé '~'. Mets un chemin ABSOLU."; exit 1;; esac`,
    // le `claude` du PATH n'est pas forcément celui qui est AUTHENTIFIÉ (deux installs cohabitent souvent)
    `CB="${remote.claudeBin || ''}"`,
    `[ -n "$CB" ] || for c in "$HOME/.local/bin/claude" "$(command -v claude 2>/dev/null||true)"; do [ -n "$c" ] && [ -x "$c" ] && { CB="$c"; break; }; done`,
    `[ -n "$CB" ] && [ -x "$CB" ] || { echo "❌ binaire claude introuvable sur la cible"; exit 1; }`,
    `echo "→ prévol : binaire $CB"`,
    // « installé » ne veut pas dire « connecté » : on exige une VRAIE réponse, pas une version
    // `|| true` OBLIGATOIRE : sous `set -e`, une sonde qui sort non-zéro tue le script
    // distant AVANT le clone — et le desktop, lui, imprime quand même son ✅. C'est
    // exactement le défaut que ce prévol existe pour tuer ; il l'a reproduit à son 1er
    // usage (12/08/2026). Une SONDE ne décide jamais de la suite : c'est le `case` qui décide.
    // AUTHENTIFICATION : on lit le JETON, on ne fait pas d'appel LLM. Un `claude -p` de contrôle
    // coûtait 30-60 s dans le chemin de lancement et la connexion SSH rendait la main avant la
    // fin du script — le clone n'avait jamais lieu, et le desktop imprimait quand même son ✅
    // (12/08/2026). Une sonde de prévol doit être INSTANTANÉE : ici on vérifie que
    // ~/.claude/.credentials.json porte bien un jeton de COMPTE (`claudeAiOauth`), pas seulement
    // un `mcpOAuth` — c'est exactement ce qui manquait au VPS avant le /login du 11/08.
    // …MAIS le jeton ne vit pas au même endroit selon l'OS. Sur macOS, Claude Code le range dans
    // le TROUSSEAU, et `~/.claude/.credentials.json` n'existe tout simplement pas : la sonde
    // Linux y répondait « NON authentifié » sur une machine parfaitement connectée, et tuait le
    // lancement (12/08/2026, 1er essai du mode --local). Troisième piège de portabilité de la
    // même famille que `setsid` et `/proc` — un prévol doit être portable AVANT d'être strict.
    // On teste la PRÉSENCE de l'entrée, jamais son contenu : le jeton ne transite nulle part.
    // …ET le jeton ne vit pas toujours dans un fichier de Claude Code. Une machine headless
    // s'authentifie couramment par un `CLAUDE_CODE_OAUTH_TOKEN` de longue durée, rangé dans un
    // `.env` que les crons sourcent : `~/.claude/.credentials.json` n'y existe alors PAS, et la
    // sonde déclarait « NON authentifié » une machine qui répondait `PONG` à un vrai aller-retour
    // (mesuré le 03/09/2026 sur le VPS b-capital, quatrième piège de portabilité de la famille
    // `setsid` / `/proc` / trousseau macOS). On lit donc AUSSI ce jeton — et on le SOURCE, parce
    // qu'il ne suffit pas de le constater : les sessions détachées héritent de cet environnement,
    // sans quoi la chaîne partirait sans identité et `claude -p` refuserait avec le CODE 0.
    // Le chemin est softcodé (`authEnvFile` du remote) : rien de propre à une machine ici.
    ...(remote.authEnvFile ? [
      `[ -f "${remote.authEnvFile}" ] && { set -a; . "${remote.authEnvFile}"; set +a; }`,
    ] : []),
    `if [ "$(uname)" = "Darwin" ]; then`,
    `  security find-generic-password -s "Claude Code-credentials" -w >/dev/null 2>&1 && AUTHOK=OUI || AUTHOK=NON`,
    `else`,
    `  AUTHOK="$(node -e 'try{const c=require(process.env.HOME+"/.claude/.credentials.json");const o=c.claudeAiOauth||{};process.stdout.write(o.accessToken?"OUI":"NON")}catch(e){process.stdout.write("NON")}' 2>/dev/null || true)"`,
    `fi`,
    `[ "$AUTHOK" = "OUI" ] || { [ -n "${'${CLAUDE_CODE_OAUTH_TOKEN:-}'}" ] && AUTHOK=ENV; }`,
    `[ "$AUTHOK" != "NON" ] || { echo "❌ claude NON authentifié sur la cible : ni jeton de compte (~/.claude/.credentials.json ou trousseau), ni CLAUDE_CODE_OAUTH_TOKEN. Procédure de /login pilotée : voir SKILL.md, section « Ce qui demande encore un humain »."; exit 1; }`,
    `[ "$AUTHOK" = "ENV" ] && echo "→ prévol : jeton d'environnement (CLAUDE_CODE_OAUTH_TOKEN) — propagé aux sessions" || echo "→ prévol : jeton de compte présent"`,
    ...(flags.local
      // LOCAL : le dépôt est la SOURCE, pas un cache. Ni clone, ni reset --hard — ce dernier
      // détruirait le travail non poussé, y compris celui d'une autre session ouverte sur le
      // même dossier. On vérifie seulement qu'on est bien sur la branche attendue.
      ? [
          `cd "${RP}"`,
          `CUR="$(git branch --show-current)"`,
          `[ "$CUR" = "${branch}" ] || git checkout -q ${branch} || { echo "❌ impossible de passer sur ${branch} (arbre sale ?)"; exit 1; }`,
          `echo "→ local : dépôt ${RP} sur ${branch} — AUCUN reset, ce dossier est la source de vérité"`,
        ]
      : [
          `if [ ! -d "${RP}/.git" ]; then`,
          repoSsh ? `  echo "→ clone ${repoSsh} dans ${RP} (cache jetable)"; git clone -q "${repoSsh}" "${RP}";`
                  : `  echo "❌ ${RP} absent et repoSsh non configuré (clone impossible)"; exit 1;`,
          `fi`,
          `cd "${RP}"`,
          `git fetch -q origin`,
          `git checkout -q ${branch} 2>/dev/null || git checkout -q -b ${branch} origin/${branch}`,
          `git reset -q --hard origin/${branch}   # VPS = exactement l'état GitHub (cache jetable, zéro dérive)`,
        ]),
    `chmod +x ${rc.nextFile} 2>/dev/null || true`,
    `[ -f "${rc.promptFile}" ] || { echo "❌ ${rc.promptFile} absent après checkout"; exit 1; }`,
    `grep -qE '^STATE:[[:space:]]*RUNNING' ${rc.progressFile} || echo "⚠️  STATE n'est pas RUNNING dans ${rc.progressFile} — next.sh ne relancera pas"`,
    // un gate qui sort en 127 n'a jamais rien vérifié : on installe AVANT de lancer la chaîne
    `if [ -f package.json ] && [ ! -d node_modules ]; then echo "→ prévol : node_modules absent, npm ci"; npm ci --no-audit --no-fund --no-progress >/dev/null 2>&1 || { echo "❌ npm ci a échoué — le gate ne pourrait pas tourner"; exit 1; }; fi`,
    `echo "→ démarrage de la 1re session (model=${model})"`,
    `ROADMAP_MODEL=${model} ROADMAP_AUTH_ENV="${remote.authEnvFile || ''}" ROADMAP_CLAUDE_BIN="$CB" bash ${rc.nextFile}`,
    `echo "PROJECT_SLUG=$(pwd | sed 's#/#-#g')"`,
  ].join('\n');

  // ── SECRETS : une seule fenêtre, AVANT de démarrer ────────────────────────────────
  // Une chaîne autonome qui découvre au step 12 qu'il lui manque un identifiant a déjà perdu
  // la nuit. On sème donc la passphrase du coffre AVANT le premier step, dans l'agent RAM des
  // DEUX machines (24 h, jamais sur disque) : les sessions y puisent ensuite ce qu'il leur faut
  // sans jamais rappeler le propriétaire. Rien de tout ça ne bloque : coffre injoignable ⇒ on
  // prévient et on part quand même (la chaîne contourne, elle ne s'arrête pas).
  const ASK = join(process.env.HOME, '.claude/skills/autocli-password/scripts/ask-secret.sh');
  const AGENT = join(process.env.HOME, '.claude/skills/autocli-password/scripts/secret-agent.mjs');
  const AGENT_REMOTE = '~/.local/lib/handoff/secret-agent.mjs';
  if (remote.ssh && existsSync(ASK) && existsSync(AGENT)) {
    try {
      sh(`ssh ${remote.ssh} 'mkdir -p ~/.local/lib/handoff'`);
      sh(`scp -q "${AGENT}" ${remote.ssh}:.local/lib/handoff/secret-agent.mjs`);
      // La clé de cache évite la fenêtre si la RAM locale a déjà le secret. Il ne transite que
      // par un PIPE : jamais un argument (visible dans `ps`), jamais un prompt distant — un
      // prompt qui n'étoile pas RÉAFFICHE ce qu'on lui donne (incident du 12/08/2026).
      execSync(
        `PW="$("${ASK}" "Passphrase Bitwarden — semée en RAM ici et sur ${remote.key} pour toute la roadmap" "handoff · secrets" bw-master)" ` +
        `&& printf '%s' "$PW" | node "${AGENT}" set bw-master 86400 ` +
        `&& printf '%s' "$PW" | ssh ${remote.ssh} 'node ${AGENT_REMOTE} set bw-master 86400'; unset PW`,
        { stdio: ['inherit', 'pipe', 'pipe'], timeout: 300000, shell: '/bin/bash' }
      );
      const has = sh(`ssh ${remote.ssh} 'node ${AGENT_REMOTE} has bw-master 2>&1 || true'`);
      info(has.startsWith('HIT')
        ? `prévol : secrets en RAM sur ${remote.key} (${has.trim()})`
        : `⚠️  secrets non semés sur ${remote.key} — la chaîne partira sans, et sautera ce qui en dépend`);
    } catch {
      info('⚠️  semis des secrets impossible — la chaîne part quand même (elle contourne, elle ne bloque pas)');
    }
  }

  console.log(`\n🚀 Roadmap launch → "${remote.key}"${remote.ssh ? ` (${remote.ssh})` : ' — CETTE machine'}, branche ${branch}`);
  let outp;
  try { outp = runTarget(remote, script, flags, root); }
  catch (e) { die(`${flags.local ? 'Lancement local' : 'SSH/lancement'} a échoué :\n   ${(e.stderr || e.message || '').toString().trim()}`); }
  console.log(outp);
  ok(`Chaîne autonome démarrée ${flags.local ? 'sur cette machine' : 'sur le VPS'} (auto-continuation via next.sh).`);

  // LE GARDE S'ARME AVEC LA CHAÎNE, PAS SUR DEMANDE. Tant que `roadmap watch` était un geste
  // séparé, il n'était armé que quand on y pensait — c'est-à-dire jamais la nuit où il aurait
  // servi. Une chaîne qui démarre sans garde est une chaîne dont personne n'apprendra la mort.
  // `--no-watch` reste possible pour un dry-run.
  if (!flags['no-watch']) armeLeWatchdog(root, cfg, flags);

  const url = cloudcodeUrl(remote);
  if (url) console.log(`\n   👀 Suivre depuis le téléphone : ${url}`);
  const cible = flags.local ? '--local' : `--to ${remote.key}`;
  console.log(`   État :   node <skill>/scripts/handoff.mjs roadmap status ${cible}`);
  console.log(`   Arrêter : node <skill>/scripts/handoff.mjs roadmap stop ${cible}\n`);
}

// ---------- roadmap enqueue : ajouter du travail À CHAUD, sans arrêter la chaîne ----------
// Le besoin est né en regardant une chaîne tourner : on relève une erreur, un apprentissage,
// une correction à apporter — et la seule issue offerte était d'attendre son arrêt. Une file
// qui ne se remplit qu'à l'arrêt n'est pas une file, c'est une liste de regrets.
//
// LA CONTRAINTE QUI DICTE TOUT LE DESIGN : la concurrence git. Écrire dans PROGRESS.md et
// pousser pendant que la chaîne travaille, c'est risquer qu'elle ait un commit local non encore
// poussé — son `push` part alors en non-fast-forward, et une session autonome devant un conflit
// improvise. On n'écrit donc PAS dans PROGRESS.md et on ne commite RIEN : on dépose dans un
// fichier que la chaîne est seule à lire, seule à intégrer, et seule à committer. Le pire cas
// est un step de délai ; il n'y a pas de cas où ça la casse.
function cmdRoadmapEnqueue(root, cfg, flags) {
  const remote = resolveTarget(root, cfg, flags);
  const rc = roadmapCfg(remote);
  const texte = (flags._.slice(2).filter((a) => !a.startsWith('--')).join(' ') || '').trim();
  if (!texte) {
    die('usage : roadmap enqueue "<ce qu\'il faut faire>" [--why "pourquoi / ce qui l\'a révélé"]\n' +
        '   L\'entrée part dans la file que la chaîne videra au début de sa prochaine session.');
  }
  // ⚠️ LA FILE SE DÉPOSE LÀ OÙ LA CHAÎNE TOURNE, PAS LÀ OÙ ON TAPE LA COMMANDE.
  // Défaut vécu le 13/08/2026 : `enqueue --to vps` ACCEPTAIT le drapeau (resolveTarget
  // résolvait bien le remote) puis écrivait dans le dépôt LOCAL. La commande annonçait
  // « entrée déposée », la file locale se remplissait, et la chaîne du VPS — seule
  // destinataire — n'a jamais rien vu. Un canal qui confirme une remise qu'il n'a pas
  // faite est pire que pas de canal : on croit avoir passé la consigne.
  const entete =
    '# INBOX — travail ajouté À CHAUD pendant que la chaîne tourne\n\n' +
    'Déposé par `roadmap enqueue`. **La chaîne est seule à écrire ici** — elle vide ce fichier au\n' +
    'début de chaque session en reportant les entrées en fin de checklist de PROGRESS.md, puis\n' +
    'les commite. Personne d\'autre ne commite ce fichier : c\'est ce qui garantit qu\'un ajout à\n' +
    'chaud ne peut jamais provoquer de divergence git sous les pieds de la chaîne.\n';
  const horo = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const bloc =
    `\n- [ ] **${texte}**\n` +
    (flags.why ? `      _Pourquoi_ : ${flags.why}\n` : '') +
    `      _Déposé le ${horo}_\n`;
  // Heredocs à délimiteur QUOTÉ : le texte de l'entrée traverse tel quel, sans qu'un `$`,
  // une apostrophe ou un backtick ne soit interprété par le shell distant.
  const FIN_H = 'INBOX_ENTETE_9f2c', FIN_B = 'INBOX_BLOC_9f2c';
  if (texte.includes(FIN_H) || texte.includes(FIN_B) || (flags.why || '').includes(FIN_B)) {
    die('Le texte de l\'entrée contient le délimiteur interne du script. Reformule.');
  }
  const inboxRel = `${rc.kitDir}/INBOX.md`;
  const script = [
    // `exit 0` et pas 1 : on veut que le message REPO_ABSENT REMONTE jusqu'ici pour être
    // traduit en français avec le chemin fautif. Un `exit 1` fait échouer le ssh, et
    // l'utilisateur reçoit « Command failed: ssh … » — vrai, mais qui ne nomme pas la cause.
    `cd "${remote.repoPath}" 2>/dev/null || { echo "REPO_ABSENT"; exit 0; }`,
    `INBOX="${inboxRel}"`,
    `if [ ! -f "$INBOX" ]; then cat > "$INBOX" <<'${FIN_H}'`,
    entete.replace(/\n$/, ''),
    FIN_H,
    `fi`,
    `cat >> "$INBOX" <<'${FIN_B}'`,
    bloc.replace(/\n$/, ''),
    FIN_B,
    `echo "ENTREES=$(grep -c '^- \\[ \\]' "$INBOX" 2>/dev/null || echo 0)"`,
  ].join('\n');
  let out;
  try { out = runTarget(remote, script, flags, root); }
  catch (e) { die(`Dépôt de l'entrée impossible sur "${remote.key}" : ${e.message}`); }
  if (/REPO_ABSENT/.test(out)) {
    die(`Le dépôt est introuvable sur "${remote.key}" (${remote.repoPath}).\n` +
        '   La chaîne n\'y tourne donc pas : rien n\'a été déposé.');
  }
  const n = (out.match(/ENTREES=(\d+)/) || [])[1] || '?';
  // On NOMME la destination : c'est ce qui manquait le jour du défaut.
  ok(`Entrée déposée dans ${inboxRel} sur « ${remote.key} » (${remote.repoPath})`);
  info('Ni commit ni push : la chaîne l\'intègrera à PROGRESS.md au début de sa prochaine session.');
  info(`File actuelle : ${n} entrée(s) en attente.`);
}

// ---------- roadmap watch : le WATCHDOG, qui survit à la session qui l'a lancé ----------
// Une chaîne autonome sait s'arrêter (AWAITING_DECISION, BLOCKED, DONE) et sait mourir (blip
// API). Dans les deux cas elle écrit son état et se tait. Tant qu'une session de surveillance
// regarde, ça passe — mais cette session a une fenêtre finie, et la chaîne, elle, continue :
// c'est la configuration exacte où un halt reste invisible des heures. Le watchdog est le
// maillon qui prévient, par un canal que l'utilisateur voit sans rien ouvrir.
// Il ne relance rien et ne pilote rien : il regarde, il alerte, il se retire.
function cmdRoadmapWatch(root, cfg, flags) {
  const remote = resolveTarget(root, cfg, flags);
  const rc = roadmapCfg(remote);
  const every = flags.every || 120;
  const name = remote.repoPath.split('/').pop();

  // LE GARDE VIT SUR LA CIBLE, ET HORS DU DÉPÔT. Deux raisons, toutes deux payées :
  //  1. `watch` était réservé au mode --local au motif qu'un watchdog distant « notifierait une
  //     machine que personne ne regarde ». C'était vrai du canal (osascript), pas du garde : le
  //     watchdog notifie désormais Minder, donc le téléphone — et c'est précisément le VPS, la
  //     machine sans yeux, qui en a besoin (chaîne morte 20 h le 12/08/2026).
  //  2. Il s'installe dans ~/.local/lib/handoff/, PAS dans le dépôt. Une chaîne VPS fait
  //     `git reset --hard origin/<branche>` à chaque step : un garde posé dans l'arbre de
  //     travail serait écrasé — ou pire, empêcherait le reset. Hors dépôt, il survit aux resets
  //     et n'a aucune chance d'entrer dans un commit.
  const wdSrc = readFileSync(join(ROADMAP_TPL, 'watchdog.sh'), 'utf8');
  const wd = '$HOME/.local/lib/handoff/watchdog.sh';
  const label = flags.label || remote.key;
  const script = [
    `mkdir -p "$HOME/.local/lib/handoff"`,
    // base64 : le script contient des quotes, des accents et des $ — tout transport « en clair »
    // à travers un heredoc SSH finit par en mutiler un.
    `printf '%s' '${Buffer.from(wdSrc, 'utf8').toString('base64')}' | base64 -d > "${wd}"`,
    `chmod +x "${wd}"`,
    `export ROADMAP_PROGRESS="${rc.progressFile}"`,
    `export ROADMAP_LABEL="${label}"`,
    `LOGDIR="$HOME/.handoff/${name}"; mkdir -p "$LOGDIR"`,
    // Un watchdog en double alerterait deux fois : on retire le précédent avant d'armer.
    `OLD="$(cat "$LOGDIR/watchdog.pid" 2>/dev/null || true)"`,
    `[ -n "$OLD" ] && kill "$OLD" 2>/dev/null && echo "→ ancien watchdog retiré (pid $OLD)"`,
    // DÉTACHEMENT RÉEL — et `nohup` seul n'en est pas un. Il protège du SIGHUP, PAS d'un kill
    // de groupe de processus : tant que l'enfant reste dans le groupe de la session qui l'a
    // lancé, il meurt avec elle. C'est ce qui a tué le watchdog de visual-lab après 4 h le
    // 12/08 — il s'est éteint sans un mot, et la chaîne est morte une heure plus tard sans que
    // personne ne l'apprenne. Un garde qui partage le sort de ce qu'il surveille ne garde rien.
    // `setsid` règle ça sous Linux mais N'EXISTE PAS sur macOS ; Python, si, et `os.setsid()`
    // est POSIX. Le double fork garantit que le process n'est pas déjà leader de groupe.
    `rm -f "$LOGDIR/watchdog.pid"`,
    `if command -v setsid >/dev/null 2>&1; then`,
    `  setsid nohup bash "${wd}" "${remote.repoPath}" ${every} >>"$LOGDIR/watchdog.out" 2>&1 </dev/null &`,
    `else`,
    `  python3 -c 'import os,sys\nif os.fork(): os._exit(0)\nos.setsid()\nif os.fork(): os._exit(0)\nos.execvp(sys.argv[1], sys.argv[1:])' bash "${wd}" "${remote.repoPath}" ${every} >>"$LOGDIR/watchdog.out" 2>&1 </dev/null &`,
    `fi`,
    // On ne suppose PAS le pid : c'est le watchdog qui écrit le sien (après un double fork,
    // le pid du lanceur ne désigne plus rien). On attend qu'il se déclare — s'il ne le fait
    // pas, il n'a pas démarré, et on le dit au lieu d'imprimer un ✓ mensonger.
    `for i in 1 2 3 4 5 6 7 8 9 10; do [ -s "$LOGDIR/watchdog.pid" ] && break; sleep 0.5; done`,
    `WPID="$(cat "$LOGDIR/watchdog.pid" 2>/dev/null || true)"`,
    `if [ -n "$WPID" ] && kill -0 "$WPID" 2>/dev/null; then`,
    `  echo "✓ watchdog armé (pid $WPID, groupe $(ps -o pgid= -p $WPID | tr -d ' '), relevé toutes les ${every}s) → $LOGDIR/watchdog.log"`,
    // Le DÉTACHEMENT se vérifie, il ne se suppose pas. Deux signes concordants : un groupe de
    // processus distinct de celui du lanceur, et un PPID de 1 (le process a été ré-parenté à
    // launchd/init après la mort du fork intermédiaire). `ps -o sess=` ne sert à rien ici : sur
    // macOS il rend 0 pour tout le monde, donc le test « même session » criait toujours.
    `if [ "$(ps -o pgid= -p $WPID | tr -d ' ')" = "$(ps -o pgid= -p $$ | tr -d ' ')" ]; then echo "⚠️  il partage le groupe du lanceur — il mourra avec lui"; else echo "   détaché : groupe propre, parent $(ps -o ppid= -p $WPID | tr -d ' ') (1 = ré-parenté au système)"; fi`,
    `else echo "❌ le watchdog ne s'est pas déclaré"; tail -3 "$LOGDIR/watchdog.out" 2>/dev/null; exit 1; fi`,
  ].join('\n');
  console.log(`\n👁  Roadmap watch — "${remote.key}" (${remote.repoPath})`);
  console.log(runTarget(remote, script, flags, root));
  info(`Il notifie MINDER (puis la machine locale) sur blocage, frontière, fin ou chaîne morte — puis se retire.`);
  info(`Surveille ${rc.progressFile} · relevé toutes les ${every}s · étiquette « ${label} ».`);
}

/** Arme le watchdog sans casser l'appelant : un garde qui ne s'arme pas ne doit pas empêcher
 *  la chaîne de partir — mais il doit le DIRE. Silence + échec est la combinaison qui a coûté
 *  les 20 h du 12/08. */
function armeLeWatchdog(root, cfg, flags) {
  try { cmdRoadmapWatch(root, cfg, flags); }
  catch (e) {
    info(`⚠️  watchdog non armé (${(e.message || '').toString().trim().slice(0, 120)}) — la chaîne tourne SANS alerte.`);
    info(`   Réessayer : node <skill>/scripts/handoff.mjs roadmap watch ${flags.local ? '--local' : `--to ${flags.to || (cfg && cfg.defaultRemote) || ''}`}`);
  }
}

// ---------- roadmap status (état du driver sur le VPS) ----------
function cmdRoadmapStatus(root, cfg, flags) {
  const remote = resolveTarget(root, cfg, flags);
  const rc = roadmapCfg(remote);
  const RP = remote.repoPath;
  const script = [
    `cd "${RP}" 2>/dev/null || { echo "REPO_ABSENT"; exit 0; }`,
    `echo "=== STATE ==="`,
    `grep -E '^(STATE|CURRENT_STEP|LAST_COMMIT|UPDATED):' ${rc.progressFile} 2>/dev/null || echo "(pas de PROGRESS.md)"`,
    `echo "=== RUNNING ==="`,
    `RP="$(pwd)"; LOGDIR="$HOME/.handoff/$(basename "$RP")"`,
    // Le PID écrit par next.sh est la SEULE cible fiable : sur un poste de travail, la session
    // interactive de l'utilisateur tourne dans le même dossier que la chaîne.
    SH_CHAINE_PIDS,
    `PIDS="$(chaine_pids "$RP" | tr '\\n' ' ')"`,
    `if [ -n "${'${PIDS// /}'}" ]; then echo "chaîne EN COURS (pid $PIDS)"; else echo "aucune session de chaîne dans ce dépôt"; fi`,
    // Vue d'appoint, portable : /proc n'existe pas sur macOS, lsof prend le relais. Sans ça,
    // le statut annonçait « aucune session » sur un Mac où la chaîne tournait.
    `cwd_of() { if [ -r "/proc/$1/cwd" ]; then readlink "/proc/$1/cwd" 2>/dev/null; else lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1; fi; }`,
    `n=0; for pid in $(pgrep -x claude 2>/dev/null); do [ "$(cwd_of $pid)" = "$RP" ] && n=$((n+1)); done`,
    `echo "sessions claude (toutes, chaîne + interactives) dans ce dépôt : $n"`,
    `echo "=== 3 derniers commits ==="`,
    `git log --oneline -3 2>/dev/null`,
    `echo "=== tail dernier log roadmap ==="`,
    `L=$(ls -t "$LOGDIR"/roadmap-*.log 2>/dev/null | head -1); [ -n "$L" ] && { echo "($L)"; tail -n 10 "$L"; } || echo "(aucun log)"`,
  ].join('\n');
  console.log(`\n📍 Roadmap status — "${remote.key}" (${RP})`);
  console.log(runTarget(remote, script, flags, root));
}

// ---------- roadmap sessions (tableau synthétique des sessions Claude du VPS) ----------
function cmdRoadmapSessions(root, cfg, flags) {
  const remote = resolveRemote(cfg, flags.to);
  if (!remote) die('Aucun remote configuré.');
  // Émet des lignes machine : P|slug|nSessions|lastSid|lastEpoch|lastTurns  et  R|pid|cwd
  const script = [
    `for d in ~/.claude/projects/*/; do`,
    `  [ -d "$d" ] || continue`,
    `  slug=$(basename "$d")`,
    `  n=$(ls "$d"*.jsonl 2>/dev/null | wc -l | tr -d ' ')`,
    `  [ "$n" = "0" ] && continue`,
    `  f=$(ls -t "$d"*.jsonl 2>/dev/null | head -1)`,
    `  printf 'P|%s|%s|%s|%s|%s\\n' "$slug" "$n" "$(basename "$f" .jsonl)" "$(stat -c %Y "$f")" "$(wc -l < "$f" | tr -d ' ')"`,
    `done`,
    `for pid in $(pgrep -x claude 2>/dev/null); do printf 'R|%s|%s\\n' "$pid" "$(readlink /proc/$pid/cwd 2>/dev/null)"; done`,
    `printf 'NOW|%s\\n' "$(date +%s)"`,
  ].join('\n');
  let raw;
  try { raw = sshLogin(remote.ssh, script); }
  catch (e) { die(`SSH a échoué :\n   ${(e.stderr || e.message || '').toString().trim()}`); }

  const projects = [];
  const running = new Set(); // slugs
  let now = Math.floor(Date.now() / 1000);
  for (const l of raw.split('\n')) {
    const p = l.split('|');
    if (p[0] === 'P') projects.push({ slug: p[1], n: +p[2], sid: p[3], epoch: +p[4], turns: +p[5] });
    else if (p[0] === 'R' && p[2]) running.add(p[2].replace(/\//g, '-'));
    else if (p[0] === 'NOW') now = +p[1];
  }
  if (!projects.length) { console.log('\n(aucune session Claude sur le VPS)\n'); return; }

  const ago = (e) => {
    const s = Math.max(0, now - e);
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} j`;
  };
  const nice = (slug) => slug.replace(/^-home-[^-]+-/, '') || '(racine ~)';
  projects.sort((a, b) => b.epoch - a.epoch);

  const rows = projects.map(p => ({
    proj: nice(p.slug),
    run: running.has(p.slug) ? '🟢 oui' : '—',
    sid: p.sid.slice(0, 8),
    last: ago(p.epoch),
    turns: String(p.turns),
    n: String(p.n),
  }));
  const cols = [
    ['Projet', 'proj'], ['En cours', 'run'], ['Dernière session', 'sid'],
    ['Activité', 'last'], ['Tours', 'turns'], ['# sess.', 'n'],
  ];
  const w = cols.map(([h, k]) => Math.max(h.length, ...rows.map(r => r[k].length)));
  const fmt = (cells) => '| ' + cells.map((c, i) => c.padEnd(w[i])).join(' | ') + ' |';
  console.log(`\n🖥️  Sessions Claude — VPS "${remote.key}"\n`);
  console.log(fmt(cols.map(c => c[0])));
  console.log('| ' + w.map(x => '-'.repeat(x)).join(' | ') + ' |');
  rows.forEach(r => console.log(fmt(cols.map(c => r[c[1]]))));
  const active = rows.filter(r => r.run !== '—').length;
  console.log(`\n   ${projects.length} projet(s), ${active} session(s) active(s).\n`);
}

// ---------- roadmap stop (arrête la chaîne autonome pour ce repo) ----------
function cmdRoadmapStop(root, cfg, flags) {
  const remote = resolveTarget(root, cfg, flags);
  const rc = roadmapCfg(remote);
  const RP = remote.repoPath;
  // DEUX gestes, et l'ordre compte. On tue le PID de la chaîne — jamais « tout claude dont le
  // répertoire est ce dépôt », qui emporterait la session interactive de l'utilisateur sur un
  // poste de travail. Puis on pose STATE: STOPPED, sans quoi une session déjà en vol
  // rappellerait next.sh en fin de step et la chaîne repartirait toute seule.
  const script = [
    `RP=$(cd "${RP}" 2>/dev/null && pwd)`,
    `[ -z "$RP" ] && { echo "REPO_ABSENT"; exit 0; }`,
    `cd "$RP"`,
    `LOGDIR="$HOME/.handoff/$(basename "$RP")"`,
    SH_CHAINE_PIDS,
    `K=0`,
    `for pid in $(chaine_pids "$RP"); do kill "$pid" 2>/dev/null && { echo "chaîne arrêtée (pid $pid)"; K=$((K+1)); }; done`,
    `[ "$K" = "0" ] && echo "aucune session de chaîne vivante dans ce dépôt"`,
    `if [ -f "${rc.progressFile}" ] && grep -qE '^STATE:[[:space:]]*RUNNING' "${rc.progressFile}"; then`,
    `  sed -i.bak -E 's/^STATE:[[:space:]]*RUNNING/STATE: STOPPED/' "${rc.progressFile}" && rm -f "${rc.progressFile}.bak"`,
    `  echo "STATE: RUNNING → STOPPED (une session encore en vol ne relancera pas)"`,
    `else echo "STATE déjà non-RUNNING"; fi`,
  ].join('\n');
  console.log(`\n🛑 Roadmap stop — "${remote.key}" (${RP})`);
  console.log(runTarget(remote, script, flags, root));
  info('La chaîne ne se relancera pas. Reprendre : remets STATE: RUNNING puis relance `roadmap launch`.');
}

// ---------- roadmap answer (injecte la réponse de l'utilisateur à une frontière + relance) ----------
function cmdRoadmapAnswer(root, cfg, flags) {
  const remote = resolveRemote(cfg, flags.to);
  if (!remote) die('Aucun remote configuré.');
  if (!remote.repoPath) die(`Le remote "${remote.key}" n'a pas de repoPath.`);
  if (!flags.decision) die('Précise la réponse : --decision "go reco 1, choix B pour 2, …".');
  const rc = roadmapCfg(remote);
  const branch = flags.branch || currentBranch();
  const model = flags.model || rc.model;
  const RP = remote.repoPath;
  const ansFile = join(rc.kitDir, 'DECISIONS_ANSWERED.md');
  const decision = shEsc(flags.decision);
  const script = [
    `cd "${RP}" 2>/dev/null || { echo "REPO_ABSENT"; exit 1; }`,
    `git checkout -q ${branch} 2>/dev/null || true`,
    `{ echo ""; echo "## Réponse de l'utilisateur $(date '+%Y-%m-%d %H:%M')"; echo '${decision}'; } >> ${ansFile}`,
    `sed -i -E 's/^STATE:.*/STATE: RUNNING/' ${rc.progressFile}`,
    `git add -A && git commit -q -m "roadmap: réponse frontière de l'utilisateur" || true`,
    `echo "→ relance session fraîche (model=${model})"`,
    `ROADMAP_MODEL=${model} ROADMAP_CLAUDE_BIN="$CB" bash ${rc.nextFile}`,
  ].join('\n');
  console.log(`\n💬 Réponse frontière → "${remote.key}", branche ${branch}`);
  console.log(sshLogin(remote.ssh, script));
  ok('Réponse injectée, STATE=RUNNING, chaîne relancée.');
}

// ---------- main ----------
const flags = parseFlags(process.argv.slice(2));
const cmd = flags._[0];
const root = repoRoot();

switch (cmd) {
  case 'init':            cmdInit(root, flags); break;
  case 'out':             cmdOut(root, loadConfig(root), flags); break;
  case 'delegate':        cmdDelegate(root, loadConfig(root), flags); break;
  case 'delegate-status': cmdDelegateStatus(root, loadConfig(root), flags); break;
  case 'in':              cmdIn(root, loadConfig(root), flags); break;
  case 'check':           cmdCheck(root, flags); break;
  case 'status':          cmdStatus(root, loadConfig(root)); break;
  case 'roadmap': {
    const sub = flags._[1];
    // En --local il n'y a rien à router : pas de remote, pas d'hôte, pas de chemin distant.
    // Exiger .claude/handoff.json reviendrait à réclamer une config de destination pour une
    // chaîne qui ne quitte pas la machine.
    const cfg = () => (flags.local ? loadConfigOptional(root) : loadConfig(root));
    switch (sub) {
      case 'init':     cmdRoadmapInit(root, flags); break;
      case 'launch':   cmdRoadmapLaunch(root, cfg(), flags); break;
      case 'status':   cmdRoadmapStatus(root, cfg(), flags); break;
      case 'sessions': cmdRoadmapSessions(root, cfg(), flags); break;
      case 'stop':     cmdRoadmapStop(root, cfg(), flags); break;
      case 'watch':    cmdRoadmapWatch(root, cfg(), flags); break;
      case 'enqueue':  cmdRoadmapEnqueue(root, cfg(), flags); break;
      case 'answer':   cmdRoadmapAnswer(root, cfg(), flags); break;
      default:
        console.log(`roadmap — exécution autonome multi-steps sur le VPS (auto-continuation)

  roadmap init                                       scaffold scripts/roadmap/{PROGRESS,CONTINUATION_PROMPT,next.sh,ctx-guard.sh}
                   [--title ..] [--objectif ..] [--branch ..] [--gate ..] [--step ..] [--force]
  roadmap launch   [--to <remote>] [--branch ..] [--model opus] [--no-watch]   bootstrap repo+branche + 1re session (+ watchdog armé d'office)
  roadmap status   [--to <remote>]                   STATE/CURRENT_STEP + session active + derniers commits + log
  roadmap sessions [--to <remote>]                   tableau synthétique des sessions Claude du VPS
  roadmap answer   --decision "..." [--to <remote>]  injecte la réponse à une frontière + relance la chaîne
  roadmap stop     [--to <remote>]                   arrête la chaîne autonome pour ce repo
  roadmap watch    [--to <remote>|--local] [--every 120] [--label ..]   arme le WATCHDOG sur la CIBLE : notifie MINDER sur blocage, frontière, fin ou chaîne morte
  roadmap enqueue  [--to <remote>|--local] "<travail>" [--why "..."]   ajoute du travail À CHAUD dans la file DE LA CIBLE, sans arrêter la chaîne ni committer`);
    }
    break;
  }
  default:
    console.log(`handoff.mjs — handoff git d'une session Claude Code entre machines

  init             [--to <nom>] [--ssh user@host] [--path ~/repo]   crée .claude/handoff.json
  out              [--to <remote>] [-m "message"] [--exec]          pousse le WIP + commande de reprise (manuelle)
  delegate         --task "..." [--to <remote>] [--max-turns N]     pousse le WIP + lance un agent AUTONOME sur le VPS
  delegate-status  [--to <remote>]                                  état de l'agent distant (en cours / terminé + log)
  in               [<branche>] [--from <remote>]                    récupère le WIP + affiche HANDOFF
  check            [--to <remote>] [--ssh user@host] [--repo <url>] sonde les canaux de transmission de la cible + préconise
  status                                                   état courant
  roadmap <sub>    init|launch|status|sessions|answer|stop         exécution autonome multi-steps sur le VPS (auto-continuation)

Config : .claude/handoff.json (par repo). Voir references/config-example.json.`);
}
