'use strict';
/* Cuisine : recettes guidées pas à pas à partir de vidéos YouTube.
   Recettes (recipes.json, écrit depuis le PC) et données perso (user.json, écrit par l'appli)
   dans un dépôt GitHub privé ; copie locale pour fonctionner sans réseau. */

// ---------- Utilitaires ----------
const APP_VERSION = '3';
const app = document.getElementById('app');
const timersEl = document.getElementById('timers');
const toastEl = document.getElementById('toast');

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
// Icône au trait : `d` = liste de chemins SVG (viewBox 24).
function icon(d, size = 20, extra = {}) {
  const svg = document.createElementNS(SVGNS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', ...extra })) svg.setAttribute(k, v);
  for (const p of [].concat(d)) { const el = document.createElementNS(SVGNS, 'path'); el.setAttribute('d', p); svg.append(el); }
  return svg;
}
const I = {
  back: 'M15 5l-7 7 7 7',
  close: ['M6 6l12 12', 'M18 6L6 18'],
  search: ['M11 4a7 7 0 100 14 7 7 0 000-14z', 'M20 20l-3.5-3.5'],
  plus: 'M12 5v14M5 12h14',
  sun: ['M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  next: 'M5 12h14M13 6l6 6-6 6',
  copy: ['M10 8h8a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-8a2 2 0 012-2z', 'M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3'],
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  replay: ['M4 12a8 8 0 108-8 8.5 8.5 0 00-6 2.5L4 8', 'M4 3v5h5'],
  book: ['M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z', 'M9 8h6M9 12h6'],
  cart: ['M4 5h2l2 11h10l2-8H7', 'M10 20h.01M17 20h.01'],
  gear: ['M12 9a3 3 0 100 6 3 3 0 000-6z', 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1'],
};
const pad2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MOIS[m - 1]} ${y}`; };
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${pad2(m % 60)}` : ''}` : `${m} min`;
const fmtClock = s => s >= 3600 ? `${Math.floor(s / 3600)}:${pad2(Math.floor(s % 3600 / 60))}:${pad2(s % 60)}` : `${Math.floor(s / 60)}:${pad2(s % 60)}`;
const fmtDur = s => `${Math.floor(s / 60)}:${pad2(s % 60)}`;
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

function toast(text, action) {
  toastEl.replaceChildren(h('span', {}, text), action ? h('a', { href: action.href, target: '_blank', rel: 'noopener' }, action.label) : null);
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { toastEl.hidden = true; }, action ? 6000 : 2500);
}

// ---------- Stockage local ----------
const K = { recipes: 'cuisine.recipes', user: 'cuisine.user', cfg: 'cuisine.settings', cook: 'cuisine.cook', timers: 'cuisine.timers' };
function load(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* stockage indisponible */ } }
let recipes = load(K.recipes, []);
let user = mergeUser(load(K.user, {}), null);
let cfg = Object.assign({ owner: '', repo: 'cuisine-data', token: '', api: '', timbre: 'alarme', volume: 1, meal: '20:00', awake: true }, load(K.cfg, {}));
// Recette en cours : { id, step, checks: { 'étape.tâche': true } }
let cook = load(K.cook, null);
let timers = load(K.timers, []);
const saveCfg = () => store(K.cfg, cfg);
const saveCook = () => store(K.cook, cook);
const saveTimers = () => store(K.timers, timers);
function saveUser() { store(K.user, user); scheduleSync(); }

const recipeById = id => recipes.find(r => r.id === id);
const servingsOf = r => user.servings[r.id]?.n || r.servings;
function setServings(r, n) {
  user.servings[r.id] = { n: Math.min(30, Math.max(1, n)), u: Date.now() };
  saveUser();
}
const noteOf = id => user.notes[id] || { rating: 0, text: '', history: [], u: 0 };
function setNote(id, patch) { user.notes[id] = { ...noteOf(id), ...patch, u: Date.now() }; saveUser(); }
function setShop(patch) { user.shop = { ...user.shop, ...patch, u: Date.now() }; saveUser(); }
const thumbUrl = r => r.source?.videoId ? `https://i.ytimg.com/vi/${r.source.videoId}/hqdefault.jpg` : '';

// ---------- Synchronisation GitHub ----------
let sync = { state: 'idle', msg: '', at: 0 }, syncTimer = null, syncing = false;
const cfgOk = () => cfg.owner && cfg.repo && cfg.token;
const apiBase = () => cfg.api || 'https://api.github.com';
const fileUrl = name => `${apiBase()}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${name}`;
const ghHeaders = () => ({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
async function ghFetch(url, opt = {}, ms = 20000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal, cache: 'no-store' }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? `délai dépassé (${ms / 1000} s sans réponse de GitHub)` : e.message); }
  finally { clearTimeout(t); }
}
const decode = b64 => JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
const encode = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
async function ghGet(name) {
  const r = await ghFetch(fileUrl(name), { headers: ghHeaders() });
  if (r.status === 404) return { sha: null, data: null };
  if (r.status === 401) throw new Error('jeton refusé par GitHub (401)');
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  if (j.encoding === 'none' || !j.content) {
    const raw = await ghFetch(fileUrl(name), { headers: { ...ghHeaders(), Accept: 'application/vnd.github.raw+json' } });
    if (!raw.ok) throw new Error(`GitHub ${raw.status}`);
    return { sha: j.sha, data: JSON.parse(await raw.text()) };
  }
  return { sha: j.sha, data: decode(j.content) };
}
async function ghPut(name, data, sha) {
  const body = { message: `appli ${new Date().toISOString()}`, content: encode(data) };
  if (sha) body.sha = sha;
  const r = await ghFetch(fileUrl(name), { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) { const e = new Error('conflit'); e.conflict = true; throw e; }
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}
// Diagnostic d'accès : compte du jeton et dépôts qu'il voit.
async function tokenReport() {
  try {
    const u = await ghFetch(`${apiBase()}/user`, { headers: ghHeaders() });
    if (!u.ok) return `Jeton refusé (GitHub ${u.status}).`;
    const login = (await u.json()).login;
    const r = await ghFetch(`${apiBase()}/user/repos?per_page=100`, { headers: ghHeaders() });
    const names = r.ok ? (await r.json()).map(x => x.full_name) : [];
    return `Ce jeton appartient à ${login} et voit : ${names.length ? names.join(', ') : 'aucun dépôt'}.`;
  } catch (e) { return `Diagnostic impossible : ${e.message}.`; }
}
function scheduleSync() {
  if (!cfgOk()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 3000);
}
async function syncNow() {
  if (!cfgOk() || syncing) return;
  syncing = true; sync = { ...sync, state: 'busy' }; renderSyncStatus();
  try {
    const rec = await ghGet('recipes.json');
    // Un jeton « fine-grained » sans accès au dépôt reçoit 404, comme un dépôt qui n'existe pas.
    if (!rec.data) throw new Error(`dépôt ${cfg.owner}/${cfg.repo} introuvable, ou le jeton n'y a pas accès. ${await tokenReport()}`);
    let changed = false;
    if (rec.data && JSON.stringify(rec.data.recipes || []) !== JSON.stringify(recipes)) {
      recipes = rec.data.recipes || []; store(K.recipes, recipes); changed = true;
    }
    // Deux essais : si l'autre appareil a écrit entre la lecture et l'écriture, on relit et on refusionne.
    for (let attempt = 0; ; attempt++) {
      const remote = await ghGet('user.json');
      const merged = mergeUser(user, remote.data);
      if (JSON.stringify(merged) !== JSON.stringify(user)) changed = true;
      user = merged; store(K.user, user);
      if (JSON.stringify(merged) === JSON.stringify(mergeUser(remote.data, null)) && remote.data) break;
      try { await ghPut('user.json', merged, remote.sha); break; }
      catch (e) { if (!e.conflict || attempt >= 1) throw e; }
    }
    sync = { state: 'ok', msg: `Synchronisé à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, at: Date.now() };
    if (changed) render();
  } catch (e) {
    sync = { state: 'err', msg: `Échec de la synchronisation : ${e.message}`, at: Date.now() };
  } finally {
    syncing = false; renderSyncStatus();
  }
}
function renderSyncStatus() {
  const el = document.getElementById('syncstatus');
  if (!el) return;
  el.className = `status ${sync.state}`;
  el.textContent = sync.state === 'busy' ? 'Synchronisation…' : sync.msg || (cfgOk() ? 'Pas encore synchronisé.' : 'Synchronisation non configurée.');
}

// ---------- Sons des minuteurs (repris de l'appli Muscu) ----------
let audioCtx = null, audioStale = false, speechReady = false;
try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* non pris en charge */ }
// Sur iPhone, le son ne part que si le contexte audio a été débloqué pendant un toucher.
function unlockAudio() {
  unlockSpeech();
  try {
    if (audioCtx && audioStale) { audioCtx.close().catch(() => {}); audioCtx = null; }
    audioStale = false;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination); src.start(0);
  } catch { /* pas d'audio */ }
}
['touchend', 'click'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.hidden) { audioStale = true; speechReady = false; } });
function tone(freq, at, dur, vol, type = 'sine', hold = false) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + at;
  o.type = type; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
  const peak = Math.min(1, Math.max(0.0002, vol / 0.45 * cfg.volume));
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  if (hold) { g.gain.setValueAtTime(peak, t + Math.max(0.01, dur - 0.02)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
function say(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR'; u.rate = 1.05; u.volume = cfg.volume;
    const v = speechSynthesis.getVoices().find(x => x.lang === 'fr-FR') || speechSynthesis.getVoices().find(x => x.lang.startsWith('fr'));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* pas de synthèse vocale */ }
}
function unlockSpeech() {
  if (speechReady || cfg.timbre !== 'voix' || !('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechReady = true; } catch { /* ignoré */ }
}
// Chaque son : `soon` (plus qu'une minute) et `end` (minuteur terminé, rejoué jusqu'à ce qu'on touche OK).
const TIMBRES = {
  alarme: { label: 'Alarme', help: 'Bip de montre digitale, sec et perçant : le plus audible avec la hotte allumée.',
    soon: () => { tone(2730, 0, 0.1, 0.45, 'square', true); tone(2730, 0.16, 0.1, 0.45, 'square', true); },
    end: () => [0, 0.12, 0.24, 0.5, 0.62, 0.74].forEach(d => tone(2730, d, 0.08, 0.45, 'square', true)) },
  clair: { label: 'Clair', help: 'Bips aigus et tenus.',
    soon: () => { tone(1976, 0, 0.13, 0.45, 'triangle', true); tone(1976, 0.2, 0.13, 0.45, 'triangle', true); },
    end: () => { tone(1568, 0, 0.15, 0.45, 'triangle', true); tone(1976, 0.18, 0.15, 0.45, 'triangle', true); tone(2637, 0.36, 0.45, 0.45, 'triangle', true); } },
  doux: { label: 'Doux', help: 'Bips ronds et graves, les plus discrets.',
    soon: () => { tone(660, 0, 0.16, 0.3); tone(660, 0.22, 0.16, 0.3); },
    end: () => { tone(880, 0, 0.16, 0.4); tone(988, 0.2, 0.16, 0.4); tone(1320, 0.4, 0.5, 0.45); } },
};
if ('speechSynthesis' in window) TIMBRES.voix = { label: 'Voix', help: 'Une voix annonce « plus qu\'une minute » puis le nom du minuteur terminé (« Four, 2e cuisson : terminé »).',
  soon: t => say(`${t.label} : plus qu'une minute`),
  end: t => say(`${t.label} : terminé`) };
const timbre = () => TIMBRES[cfg.timbre] || TIMBRES.alarme;

// ---------- Minuteurs (plusieurs en même temps) ----------
// { id, label, end, total, rid, step, soon, rang, ack }. Ils survivent à la fermeture de l'appli
// (heure de fin stockée) ; l'iPhone ne sonne que si l'appli est ouverte, d'où l'écran gardé allumé.
function startTimer(r, i) {
  const st = r.steps[i];
  unlockAudio();
  timers.push({ id: `${Date.now()}`, label: st.wait.label, end: Date.now() + st.wait.min * 60000, total: st.wait.min * 60, rid: r.id, step: i });
  saveTimers(); render();
}
const timerLeft = t => Math.ceil((t.end - Date.now()) / 1000);
function stopTimer(id) { timers = timers.filter(t => t.id !== id); saveTimers(); render(); }
function addMinute(id) {
  const t = timers.find(x => x.id === id);
  if (!t) return;
  if (timerLeft(t) <= 0) { t.end = Date.now(); t.rang = 0; t.soon = false; }
  t.end += 60000; t.total += 60;
  saveTimers(); render();
}
let shown = '';
function tickTimers() {
  for (const t of timers) {
    const left = (t.end - Date.now()) / 1000;
    if (!t.soon && t.total > 120 && left <= 60 && left > 55) { t.soon = true; timbre().soon(t); }
    // Fin : le signal est rejoué toutes les 4 s pendant 2 min, ou jusqu'à OK.
    if (left <= 0) {
      const n = Math.floor(-left / 4);
      if ((t.rang ?? -1) < n && n < 30) { t.rang = n; timbre().end(t); }
    }
  }
  const key = timers.map(t => `${t.id}:${Math.max(0, timerLeft(t))}`).join('|');
  if (key !== shown) { shown = key; renderTimers(); }
}
setInterval(tickTimers, 250);
function timerCard(t, mini) {
  const left = timerLeft(t);
  if (left <= 0) {
    return h('div', { class: `tm end${mini ? ' mini' : ''}` },
      h('div', { class: 'lbl' }, h('span', {}, t.label), h('b', {}, 'Terminé')),
      h('button', { onclick: () => addMinute(t.id) }, '+1 min'),
      h('button', { onclick: () => stopTimer(t.id) }, 'OK'));
  }
  return h('div', { class: `tm${mini ? ' mini' : ''}` },
    h('div', { class: 'lbl' }, h('span', {}, t.label), h('b', {}, fmtClock(left))),
    h('button', { onclick: () => addMinute(t.id) }, '+1 min'),
    h('button', { 'aria-label': `Arrêter le minuteur ${t.label}`, onclick: () => stopTimer(t.id) }, 'Arrêter'));
}
// Dans l'écran « En cuisine », les minuteurs s'affichent sous l'en-tête ; ailleurs, en haut de l'écran.
function renderTimers() {
  const slot = document.getElementById('cooktimers');
  if (slot) { timersEl.hidden = true; slot.replaceChildren(...timers.map(t => timerCard(t))); return; }
  timersEl.hidden = !timers.length;
  timersEl.replaceChildren(...timers.map(t => timerCard(t, true)));
}

// Écran gardé allumé pendant la cuisine.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* refusé */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tickTimers(); syncNow();
  if (document.body.classList.contains('cooking') && cfg.awake) keepAwake(true);
});

// ---------- Écran : mes recettes ----------
let query = '', filter = 'Toutes';
function matches(r) {
  if (filter === 'À lancer la veille' && !hasVeille(r)) return false;
  if (filter !== 'Toutes' && filter !== 'À lancer la veille' && !(r.tags || []).includes(filter)) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  return [r.title, r.source?.channel, ...(r.tags || []), ...r.ingredients.map(x => x.name)].some(x => (x || '').toLowerCase().includes(q));
}
function recipeCard(r) {
  const p = plan(r), work = p.reduce((a, d) => a + d.work, 0), rest = p.find(d => d.rest)?.rest;
  const n = noteOf(r.id);
  const inProgress = cook && cook.id === r.id;
  return h('a', { class: 'card rcard', href: `#/r/${r.id}` },
    h('div', { class: 'thumb', style: `background-image: url("${thumbUrl(r)}")` },
      r.source?.duration ? h('span', { class: 'dur' }, fmtDur(r.source.duration)) : null),
    h('div', { class: 'body' },
      h('div', { class: 'row', style: 'flex-wrap: wrap; gap: 6px' },
        inProgress ? h('span', { class: 'badge', style: 'background: var(--accent); color: var(--on-accent)' }, `En cours : étape ${cook.step + 1}`) : null,
        hasVeille(r) ? h('span', { class: 'badge wait' }, 'À lancer la veille') : null,
        n.history.length ? h('span', { class: 'badge' }, `Faite ${n.history.length} fois${n.rating ? ` · ${'★'.repeat(n.rating)}` : ''}`) : h('span', { class: 'badge' }, 'Pas encore cuisinée')),
      h('h2', {}, r.title),
      h('span', { class: 'muted small' }, r.source?.channel || ''),
      h('div', { class: 'meta' },
        h('span', {}, `${servingsOf(r)} pers.`),
        h('span', {}, `${fmtMin(work)} de travail`),
        rest ? h('span', {}, `${rest.label.toLowerCase().startsWith('marinade') ? 'marinade' : 'attente'} ${fmtMin(rest.min)}`) : null,
        r.nutrition ? h('span', {}, `~${r.nutrition.kcal} kcal`) : null)));
}
function viewLibrary() {
  const tags = ['Toutes', 'À lancer la veille', ...new Set(recipes.flatMap(r => r.tags || []))];
  const list = h('div', { class: 'list' });
  const fill = () => {
    const found = recipes.filter(matches).sort((a, b) => a.title.localeCompare(b.title));
    list.replaceChildren(...[
      ...found.map(recipeCard),
      recipes.length && !found.length ? h('p', { class: 'muted', style: 'margin: 0' }, 'Aucune recette ne correspond.') : null,
      !cfgOk() && !recipes.length ? h('a', { class: 'card p', href: '#/reglages', style: 'text-decoration: none; color: inherit' },
        h('b', {}, 'Première ouverture'), h('p', { class: 'muted small', style: 'margin: 4px 0 0' }, 'Renseigne ton dépôt de données et ton jeton dans Réglages pour récupérer tes recettes.')) : null,
      h('div', { class: 'addcard' },
        h('span', { style: 'color: var(--accent)' }, icon(I.plus, 28)),
        h('div', { class: 'row', style: 'flex-direction: column; align-items: flex-start; gap: 3px' },
          h('b', { style: 'font-size: 15px' }, 'Ajouter une recette'),
          h('span', { class: 'muted small' }, 'Envoie le lien YouTube à Claude sur le PC. La fiche apparaît ici après ta validation.')))].filter(Boolean));
  };
  fill();
  return [
    h('div', { class: 'head' },
      h('h1', {}, 'Mes recettes'),
      h('label', { class: 'search' }, icon(I.search, 18, { stroke: 'var(--muted)' }),
        h('input', { type: 'search', placeholder: 'Chercher une recette, un ingrédient', 'aria-label': 'Chercher une recette', value: query,
          oninput: e => { query = e.target.value; fill(); } })),
      h('div', { class: 'chips' }, tags.map(t => h('button', { class: `chip${filter === t ? ' on' : ''}`, onclick: () => { filter = t; render(); } }, t)))),
    list,
  ];
}

// ---------- Écran : fiche recette ----------
function stepper(r) {
  return h('div', { class: 'card p stepper' },
    h('span', { style: 'font-weight: 600' }, 'Personnes'),
    h('div', {},
      h('button', { 'aria-label': 'Une personne de moins', onclick: () => { setServings(r, servingsOf(r) - 1); render(); } }, '−'),
      h('b', {}, servingsOf(r)),
      h('button', { 'aria-label': 'Une personne de plus', onclick: () => { setServings(r, servingsOf(r) + 1); render(); } }, '+')));
}
function tabApercu(r) {
  const days = plan(r);
  const dayBlock = d => h('div', { class: 'stack', style: 'gap: 6px' },
    h('div', { class: 'row between', style: 'font-size: 14px' },
      h('b', {}, d.day === 'veille' ? 'La veille' : hasVeille(r) ? 'Le jour J' : 'Déroulé'),
      h('span', { class: 'muted' }, d.total > d.work ? `${fmtMin(d.total)}, dont ${fmtMin(d.work)} de travail` : `${fmtMin(d.work)} de travail`)),
    h('div', { class: 'bar' }, [...d.segs, d.rest ? { kind: 'wait', min: Math.max(d.work * 2, 10) } : null].filter(Boolean)
      .map(s => h('div', { class: s.kind, style: `flex: ${s.min}` }))),
    h('span', { class: 'small', style: 'color: var(--ink-2)' }, daySummary(r, d)));
  return [
    stepper(r),
    h('div', {}, h('h2', {}, 'Déroulé'),
      h('div', { class: 'card p stack', style: 'gap: 14px' }, days.map(dayBlock),
        h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background: var(--work)' }), 'Travail'), h('span', {}, h('i', { style: 'background: var(--wait)' }), 'Attente')))),
    r.nutrition ? h('div', {},
      h('h2', {}, 'Par portion ', h('span', { class: 'muted small', style: 'font-weight: 500' }, `(${r.nutrition.note || 'estimation'})`)),
      h('div', { class: 'nutri' },
        [['kcal', r.nutrition.kcal, 'kcal'], ['prot', `${r.nutrition.prot} g`, 'protéines'], ['carb', `${r.nutrition.carb} g`, 'glucides'], ['fat', `${r.nutrition.fat} g`, 'lipides']]
          .map(([, v, l]) => h('div', { class: 'card' }, h('b', {}, v), h('span', {}, l))))) : null,
    r.serve ? h('p', { class: 'small', style: 'margin: 0; color: var(--ink-2)' }, h('b', {}, 'Servir : '), r.serve) : null,
  ];
}
// Résumé d'une journée : attentes au four listées, glaçage pendant une cuisson…
function daySummary(r, d) {
  const steps = r.steps.filter(s => (s.day || 'jour') === d.day);
  if (d.rest) return `${steps.filter(s => s.work).length} étapes, puis ${d.rest.label.toLowerCase()} (${fmtMin(d.rest.min)}).`;
  const waits = steps.filter(s => s.wait && s.wait.min <= LONG_WAIT).map(s => fmtMin(s.wait.min));
  const during = steps.filter(s => s.during && s.during.length).length;
  return [waits.length ? `${plural(waits.length, 'attente')} (${waits.join(', ')})` : null,
    during ? `${plural(during, 'tâche')} à faire pendant une attente` : null].filter(Boolean).join('. ') + '.';
}
function tabIngredients(r) {
  const n = servingsOf(r), groups = [...new Set(r.ingredients.map(x => x.group || ''))];
  const inList = (user.shop.list || []).some(x => x.id === r.id);
  return [
    stepper(r),
    h('div', { class: 'row between' },
      h('span', { class: 'muted small' }, 'Quantités recalculées automatiquement'),
      h('button', { class: 'btn small', onclick: () => {
        const list = (user.shop.list || []).filter(x => x.id !== r.id).concat({ id: r.id, servings: n });
        setShop({ list }); toast(inList ? `Liste de courses mise à jour (${n} pers.)` : 'Ajouté à la liste de courses'); render();
      } }, inList ? '↻ Courses' : '+ Courses')),
    h('div', { class: 'card', style: 'padding: 4px 16px 8px' }, groups.map(g => [
      g ? h('div', { class: 'label' }, g) : null,
      h('div', { class: 'lines' }, r.ingredients.filter(x => (x.group || '') === g).map(x => h('div', {}, h('span', {}, x.name), h('b', {}, amount(x, r.servings, n))))),
    ])),
  ];
}
function tabEtapes(r) {
  const days = [...new Set(r.steps.map(s => s.day || 'jour'))];
  return [
    h('span', { class: 'small', style: 'color: var(--ink-2)' }, 'Chaque étape a son extrait vidéo. Touche une étape pour l\'ouvrir.'),
    h('div', { class: 'card', style: 'padding: 0 16px' }, days.map(d => [
      days.length > 1 ? h('div', { class: 'label' }, d === 'veille' ? 'La veille' : 'Le jour J') : null,
      h('div', { class: 'steps' }, r.steps.map((s, i) => (s.day || 'jour') !== d ? null : h('button', { onclick: () => openCook(r, i) },
        h('span', { class: 'n' }, i + 1), h('span', { class: 't' }, s.title),
        s.wait ? h('span', { class: 'badge wait' }, fmtMin(s.wait.min)) : s.start != null ? h('span', { class: 'tc' }, fmtDur(s.start)) : null))),
    ])),
  ];
}
function starsEl(value, onPick) {
  return h('div', { class: 'stars', role: 'radiogroup', 'aria-label': 'Note sur 5' },
    [1, 2, 3, 4, 5].map(k => h('button', { class: k <= value ? 'on' : '', role: 'radio', 'aria-checked': String(k === value), 'aria-label': plural(k, 'étoile'), onclick: () => onPick(k === value ? 0 : k) },
      icon(I.star, 30, { fill: k <= value ? 'currentColor' : 'none', 'stroke-width': 1.8 }))));
}
function tabNotes(r) {
  const n = noteOf(r.id);
  return [
    h('div', { class: 'card p stack', style: 'gap: 8px' },
      h('b', {}, 'Ma note'),
      starsEl(n.rating, k => { setNote(r.id, { rating: k }); render(); }),
      n.history.length ? null : h('span', { class: 'muted small' }, 'Pas encore cuisinée.')),
    h('label', { class: 'card p stack', style: 'gap: 8px' },
      h('b', {}, 'Mes ajustements'),
      h('textarea', { rows: 4, placeholder: 'Ex. : 2 min de plus au four, moins de sel, ajouter du piment', value: n.text || '',
        oninput: e => { clearTimeout(tabNotes.t); const v = e.target.value; tabNotes.t = setTimeout(() => setNote(r.id, { text: v }), 600); } })),
    h('div', { class: 'card p stack', style: 'gap: 6px' },
      h('b', {}, 'Historique'),
      n.history.length
        ? h('div', { class: 'lines' }, [...n.history].reverse().map(e => h('div', {}, h('span', {}, fmtDate(e.date)), h('b', {}, e.rating ? '★'.repeat(e.rating) : ''))))
        : h('span', { class: 'muted small' }, 'Chaque fois que tu termines la recette, la date et ta note s\'ajoutent ici.')),
  ];
}
const TABS = [['apercu', 'Aperçu', tabApercu], ['ingredients', 'Ingrédients', tabIngredients], ['etapes', 'Étapes', tabEtapes], ['notes', 'Mes notes', tabNotes]];
function viewRecipe(id, tab) {
  const r = recipeById(id);
  if (!r) return notFound();
  const cur = TABS.find(t => t[0] === tab) || TABS[0];
  const going = cook && cook.id === r.id;
  return [
    h('div', { class: 'hero', style: `background-image: url("${thumbUrl(r)}")` },
      h('a', { class: 'round', href: '#/', 'aria-label': 'Retour aux recettes' }, icon(I.back, 20, { 'stroke-width': 2.2 }))),
    h('div', { class: 'titlebar' },
      h('h1', { style: 'font-size: 23px' }, r.title),
      h('p', {}, r.source?.channel || '', r.source?.url ? [' · ', h('a', { href: r.source.url, target: '_blank', rel: 'noopener' }, 'Voir sur YouTube')] : null),
      h('div', { class: 'rtabs', role: 'tablist', 'aria-label': 'Sections de la recette' },
        TABS.map(([k, label]) => h('button', { role: 'tab', 'aria-selected': String(k === cur[0]), onclick: () => { location.replace(`#/r/${r.id}/${k}`); } }, label)))),
    h('div', { class: 'pad stack' }, cur[2](r)),
    h('div', { class: 'cta' },
      h('button', { class: 'btn primary', onclick: () => openCook(r, going ? cook.step : 0) },
        going ? `Reprendre (étape ${cook.step + 1})` : hasVeille(r) ? 'Commencer : la veille' : 'Commencer'),
      going ? null : h('span', { class: 'hint' }, startHint(r, cfg.meal))),
  ];
}
function openCook(r, i) {
  if (!cook || cook.id !== r.id) cook = { id: r.id, step: i, checks: {} };
  cook.step = i; saveCook();
  location.hash = `#/c/${r.id}/${i}`;
}

// ---------- Écran : en cuisine ----------
function viewCook(id, i) {
  const r = recipeById(id);
  if (!r) return notFound();
  i = Math.min(Math.max(0, Number(i) || 0), r.steps.length - 1);
  if (!cook || cook.id !== r.id) cook = { id: r.id, step: i, checks: {} };
  if (cook.step !== i) { cook.step = i; }
  saveCook();
  const st = r.steps[i], n = servingsOf(r), last = i === r.steps.length - 1;
  const prevDay = i > 0 ? r.steps[i - 1].day || 'jour' : null, day = st.day || 'jour';
  const running = timers.find(t => t.rid === r.id && t.step === i);
  const ytSrc = st.start != null && r.source?.videoId
    ? `https://www.youtube-nocookie.com/embed/${r.source.videoId}?start=${st.start}${st.end ? `&end=${st.end}` : ''}&playsinline=1&rel=0&modestbranding=1`
    : null;
  let frame = null;
  const go = k => { location.replace(`#/c/${r.id}/${k}`); };
  return [
    h('div', { class: 'ctop' },
      h('div', { class: 'row' },
        h('a', { class: 'icon', href: `#/r/${r.id}/etapes`, 'aria-label': 'Quitter la recette' }, icon(I.close, 20, { 'stroke-width': 2.2 })),
        h('span', { class: 'title' }, `${r.title} · Étape ${i + 1} sur ${r.steps.length}`),
        h('button', { class: `icon${cfg.awake ? ' on' : ''}`, 'aria-label': cfg.awake ? 'Écran toujours allumé : activé' : 'Écran toujours allumé : désactivé', 'aria-pressed': String(!!cfg.awake),
          onclick: () => { cfg.awake = !cfg.awake; saveCfg(); keepAwake(cfg.awake); toast(cfg.awake ? 'L\'écran reste allumé' : 'L\'écran peut se mettre en veille'); render(); } }, icon(I.sun))),
      h('div', { class: 'prog', style: `grid-template-columns: repeat(${r.steps.length}, minmax(0, 1fr))` },
        r.steps.map((s, k) => h('i', { class: k < i ? 'done' : k === i ? 'cur' : '' })))),
    h('div', { class: 'cook' },
      h('div', { id: 'cooktimers', class: 'timers' }),
      ytSrc ? h('div', { class: 'stack', style: 'gap: 6px' },
        h('div', { class: 'video' },
          frame = h('iframe', { src: ytSrc, title: `Extrait vidéo de l'étape ${i + 1}`, allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true })),
        h('button', { class: 'btn small', style: 'align-self: flex-end; display: flex; align-items: center; gap: 6px', onclick: () => { frame.src = `${ytSrc}&autoplay=1`; } },
          icon(I.replay, 14), `Revoir l'extrait (${fmtDur(st.start)} → ${fmtDur(st.end || st.start)})`)) : null,
      day !== prevDay && hasVeille(r) ? h('span', { class: 'badge wait daytag' }, day === 'veille' ? 'La veille' : 'Le jour J') : null,
      h('div', { class: 'stack', style: 'gap: 6px' },
        h('h1', {}, st.title),
        h('p', { class: 'text' }, fillText(st.text, r, n))),
      st.wait && st.wait.min > LONG_WAIT
        ? h('div', { class: 'longwait' }, h('b', {}, `${st.wait.label} : ${fmtMin(st.wait.min)}. `), 'Tu peux fermer l\'appli : la recette reprendra à l\'étape suivante.')
        : st.wait && !running ? h('button', { class: 'btn', style: 'border-color: var(--wait-ink); color: var(--wait-ink)', onclick: () => startTimer(r, i) },
          `Lancer le minuteur : ${st.wait.label.toLowerCase()} (${fmtMin(st.wait.min)})`) : null,
      st.during && st.during.length ? h('div', { class: 'card p during' },
        h('span', { class: 'label' }, `Pendant ce temps${st.wait ? ` (${fmtMin(st.wait.min)})` : ''}`),
        st.during.map((txt, k) => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: !!cook.checks[`${i}.${k}`], onchange: e => { cook.checks[`${i}.${k}`] = e.target.checked; saveCook(); } }),
          h('span', {}, fillText(txt, r, n))))) : null,
      st.next ? h('div', { class: 'next' }, icon(I.next, 16, { style: 'flex: none; margin-top: 3px' }), h('span', {}, st.next)) : null),
    h('div', { class: 'cta' },
      h('div', { class: 'cnav' },
        h('button', { class: 'btn', disabled: i === 0, onclick: () => go(i - 1) }, 'Précédente'),
        last ? h('a', { class: 'btn primary', href: `#/fin/${r.id}` }, 'Terminer')
          : h('button', { class: 'btn primary', onclick: () => go(i + 1) }, 'Étape suivante')),
      h('button', { class: 'btn link', style: 'display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px', onclick: () => askClaude(r, i) },
        icon(I.copy, 16), 'Demander à Claude (copie la recette et l\'étape)')),
  ];
}
async function askClaude(r, i) {
  const text = claudeText(r, servingsOf(r), i, timers.filter(t => timerLeft(t) > 0));
  try { await navigator.clipboard.writeText(text); toast('Copié. Colle-le dans Claude et ajoute ta question.', { href: 'https://claude.ai/new', label: 'Ouvrir Claude' }); }
  catch { toast('Copie impossible sur cet appareil.'); }
}

// ---------- Écran : fin de recette ----------
let endRating = 0;
function viewEnd(id) {
  const r = recipeById(id);
  if (!r) return notFound();
  const n = noteOf(r.id);
  let text = n.text || '';
  return [
    h('div', { class: 'head' }, h('h1', {}, 'Bon appétit !'), h('p', { class: 'muted', style: 'margin: 0' }, `${r.title} est terminé. Comment c'était ?`)),
    h('div', { class: 'pad stack' },
      h('div', { class: 'card p stack', style: 'gap: 8px' }, h('b', {}, 'Ma note'), starsEl(endRating, k => { endRating = k; render(); })),
      h('label', { class: 'card p stack', style: 'gap: 8px' }, h('b', {}, 'Mes ajustements pour la prochaine fois'),
        h('textarea', { rows: 4, value: text, placeholder: 'Ex. : 2 min de plus au four, moins de sel', oninput: e => { text = e.target.value; } }))),
    h('div', { class: 'cta' },
      h('button', { class: 'btn primary', onclick: () => {
        const t = Date.now();
        setNote(r.id, { rating: endRating || n.rating, text, history: [...n.history, { t, date: today(), rating: endRating }] });
        timers = timers.filter(x => x.rid !== r.id); saveTimers();
        cook = null; saveCook(); endRating = 0;
        keepAwake(false);
        location.hash = `#/r/${r.id}/notes`;
      } }, 'Enregistrer'),
      h('a', { class: 'btn link', href: `#/c/${r.id}/${r.steps.length - 1}`, style: 'display: flex; align-items: center; justify-content: center' }, 'Revenir à la dernière étape')),
  ];
}

// ---------- Écran : courses ----------
let picking = false;
function viewShop() {
  const list = user.shop.list || [], checked = user.shop.checked || {};
  const groups = shopping(recipes, list);
  const total = groups.reduce((a, g) => a + g.items.length, 0), done = groups.reduce((a, g) => a + g.items.filter(x => checked[x.key]).length, 0);
  const others = recipes.filter(r => !list.some(x => x.id === r.id));
  const toggle = (key, on) => { const c = { ...checked }; if (on) c[key] = true; else delete c[key]; setShop({ checked: c }); render(); };
  return [
    h('div', { class: 'head', style: 'gap: 12px' },
      h('h1', {}, 'Courses'),
      h('div', { class: 'chips', style: 'align-items: center' },
        list.map(x => { const r = recipeById(x.id); return r ? h('span', { class: 'rchip' }, `${r.title} · ${x.servings} pers.`,
          h('button', { 'aria-label': `Retirer ${r.title} de la liste`, onclick: () => { setShop({ list: list.filter(y => y.id !== x.id) }); render(); } }, icon(I.close, 14, { 'stroke-width': 2.4 }))) : null; }),
        others.length ? h('button', { class: 'chip add', onclick: () => { picking = !picking; render(); } }, '+ Ajouter une recette') : null),
      picking ? h('div', { class: 'picker' }, others.map(r => h('button', { class: 'btn small', onclick: () => {
        picking = false; setShop({ list: [...list, { id: r.id, servings: servingsOf(r) }] }); render();
      } }, `${r.title} (${servingsOf(r)} pers.)`))) : null,
      total ? h('span', { class: 'muted small' }, `Quantités additionnées si plusieurs recettes. ${done} sur ${total} cochés.`) : null),
    h('div', { class: 'pad stack shop', style: 'padding-top: 6px; gap: 12px' },
      total ? groups.map(g => h('div', { class: 'card', style: 'padding: 4px 14px' },
        h('div', { class: 'label' }, g.rayon),
        g.items.map(it => h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: !!checked[it.key], onchange: e => toggle(it.key, e.target.checked) }),
          h('span', {}, it.name, list.length > 1 && it.from.length < list.length ? h('span', { class: 'muted small' }, ` (${it.from.join(', ')})`) : null),
          h('em', {}, it.amount)))))
        : h('p', { class: 'muted', style: 'margin: 0' }, 'Liste vide. Ajoute une recette ici, ou depuis l\'onglet Ingrédients d\'une recette.'),
      total ? h('div', { class: 'row', style: 'gap: 10px' },
        h('button', { class: 'btn small', disabled: !done, onclick: () => { setShop({ checked: {} }); render(); } }, 'Tout décocher'),
        h('button', { class: 'btn small', onclick: () => { if (confirm('Vider la liste de courses ?')) { setShop({ list: [], checked: {} }); render(); } } }, 'Vider la liste')) : null),
  ];
}

// ---------- Écran : réglages ----------
function viewSettings() {
  const f = { ...cfg };
  const field = (label, key, attrs = {}) => h('label', { class: 'field' }, label,
    h('input', { value: f[key] || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs, oninput: e => { f[key] = e.target.value.trim(); } }));
  return [
    h('div', { class: 'head' }, h('h1', {}, 'Réglages')),
    h('div', { class: 'pad stack' },
      h('div', { class: 'card p stack', style: 'gap: 12px' },
        h('b', {}, 'Synchronisation'),
        h('span', { class: 'muted small' }, 'Tes recettes, tes notes et ta liste de courses sont gardées dans un dépôt GitHub privé. Le jeton reste sur ce téléphone.'),
        field('Compte GitHub', 'owner', { placeholder: 'ex. mon-compte' }),
        field('Dépôt de données', 'repo', { placeholder: 'cuisine-data' }),
        field('Jeton d\'accès', 'token', { type: 'password', placeholder: 'github_pat_…' }),
        h('button', { class: 'btn primary', onclick: async () => { Object.assign(cfg, { owner: f.owner, repo: f.repo, token: f.token }); saveCfg(); await syncNow(); } }, 'Enregistrer et synchroniser'),
        h('div', { id: 'syncstatus', class: 'status' })),
      h('div', { class: 'card p stack', style: 'gap: 12px' },
        h('b', {}, 'Minuteurs'),
        h('label', { class: 'field' }, 'Son',
          h('select', { onchange: e => { cfg.timbre = e.target.value; saveCfg(); render(); } },
            Object.entries(TIMBRES).map(([k, t]) => h('option', { value: k, selected: cfg.timbre === k }, t.label)))),
        h('span', { class: 'muted small' }, timbre().help),
        h('label', { class: 'field' }, `Volume : ${Math.round(cfg.volume * 100)} %`,
          h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: cfg.volume, onchange: e => { cfg.volume = Number(e.target.value); saveCfg(); render(); } })),
        h('button', { class: 'btn', onclick: () => { unlockAudio(); const t = { label: 'Essai' }; timbre().soon(t); setTimeout(() => timbre().end(t), cfg.timbre === 'voix' ? 1800 : 700); } }, 'Essayer le son'),
        h('span', { class: 'muted small' }, 'L\'iPhone ne sonne que si l\'appli est ouverte : pendant une recette, l\'écran reste allumé (icône soleil).')),
      h('div', { class: 'card p stack', style: 'gap: 12px' },
        h('b', {}, 'Heure du repas'),
        h('label', { class: 'field' }, 'Pour calculer l\'heure de départ d\'une recette',
          h('input', { type: 'time', value: cfg.meal, onchange: e => { cfg.meal = e.target.value || '20:00'; saveCfg(); } }))),
      h('div', { class: 'card p stack', style: 'gap: 6px' },
        h('b', {}, 'Ajouter une recette'),
        h('span', { class: 'muted small' }, 'Envoie le lien d\'une vidéo YouTube à Claude sur le PC : il prépare la fiche (ingrédients, étapes, extraits vidéo, temps), tu la valides, puis elle arrive ici à la synchronisation suivante.')),
      h('p', { class: 'muted small', style: 'margin: 0; text-align: center' }, `Cuisine, version ${APP_VERSION}`)),
  ];
}

function notFound() {
  return [h('div', { class: 'head' }, h('h1', {}, 'Recette introuvable'),
    h('p', { class: 'muted', style: 'margin: 0' }, 'Elle a peut-être été retirée. Synchronise depuis les Réglages.'),
    h('a', { href: '#/' }, 'Retour aux recettes'))];
}

// ---------- Navigation ----------
function render() {
  const [route, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  const full = ['r', 'c', 'fin'].includes(route);
  document.body.classList.toggle('full', full);
  document.body.classList.toggle('cooking', route === 'c');
  if (route === 'c' && cfg.awake) keepAwake(true); else if (route !== 'c') keepAwake(false);
  const tab = route === 'courses' ? 'shop' : route === 'reglages' ? 'set' : 'rec';
  document.querySelectorAll('#tabs a').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  const view = route === 'r' ? viewRecipe(a, b) : route === 'c' ? viewCook(a, b) : route === 'fin' ? viewEnd(a)
    : route === 'courses' ? viewShop() : route === 'reglages' ? viewSettings() : viewLibrary();
  // On garde la position de défilement quand on reste sur le même écran (cocher, +1 personne…).
  const same = render.last === location.hash, y = window.scrollY;
  app.replaceChildren(...[].concat(view).flat(Infinity).filter(Boolean));
  window.scrollTo(0, same ? y : 0);
  render.last = location.hash;
  shown = ''; renderTimers(); renderSyncStatus();
}
// Icônes de la barre d'onglets.
document.querySelectorAll('#tabs a').forEach(a => a.prepend(icon({ rec: I.book, shop: I.cart, set: I.gear }[a.dataset.tab], 22)));
window.addEventListener('hashchange', render);
render();
syncNow();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
