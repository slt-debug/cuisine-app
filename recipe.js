'use strict';
/* Règles partagées sur les recettes : quantités selon le nombre de personnes, déroulé (travail / attente),
   liste de courses, fusion des données de deux appareils. Sans accès au DOM : testables avec Node. */

// Unités : forme courte (s), pluriel (p) si elle change, pas d'arrondi (step) pour l'ajustement des portions.
const UNITS = {
  cs: { s: 'c. à s.', step: 0.25 },
  cc: { s: 'c. à c.', step: 0.25 },
  g: { s: 'g' },
  kg: { s: 'kg', step: 0.05 },
  ml: { s: 'ml' },
  cl: { s: 'cl', step: 1 },
  l: { s: 'l', step: 0.05 },
  gousse: { s: 'gousse', p: 'gousses', step: 0.5 },
  morceau: { s: 'morceau', p: 'morceaux', step: 0.5 },
  tranche: { s: 'tranche', p: 'tranches', step: 1 },
  pincee: { s: 'pincée', p: 'pincées', step: 1 },
  piece: { s: '', step: 0.5 },
};
// Rayons de la liste de courses, dans l'ordre d'un parcours de magasin. Un rayon inconnu passe à la fin.
const RAYONS = ['Fruits et légumes', 'Boucherie, poissonnerie', 'Crèmerie', 'Boulangerie', 'Épicerie', 'Épicerie asiatique', 'Placard', 'Surgelés', 'Boissons', 'Autres'];
// Au-delà de 3 h, une attente (marinade, repos au frigo) sépare deux journées : pas de minuteur sonore.
const LONG_WAIT = 180;

function roundQty(v, unit) {
  const u = UNITS[unit] || {};
  if (u.step) return Math.max(u.step, Math.round(v / u.step) * u.step);
  // g, ml : arrondi lisible selon l'ordre de grandeur.
  const step = v < 20 ? 1 : v < 100 ? 5 : 10;
  return Math.max(step, Math.round(v / step) * step);
}
const FRACTIONS = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
function fmtNum(v) {
  const whole = Math.floor(v + 1e-9), rest = v - whole;
  if (rest < 0.01) return String(whole);
  const f = FRACTIONS.find(([x]) => Math.abs(rest - x) < 0.01);
  if (f) return whole ? `${whole} ${f[1]}` : f[1];
  return String(Math.round(v * 100) / 100).replace('.', ',');
}
function fmtAmount(qty, unit) {
  const u = UNITS[unit] || { s: unit || '' };
  const label = qty > 1 && u.p ? u.p : u.s;
  return label ? `${fmtNum(qty)} ${label}` : fmtNum(qty);
}
// Quantité d'un ingrédient pour `servings` personnes : texte prêt à afficher.
function amount(ing, base, servings) {
  if (ing.qty == null) return ing.text || '';
  return fmtAmount(roundQty(ing.qty * servings / base, ing.unit), ing.unit);
}
// Remplace {id} dans un texte d'étape par la quantité de l'ingrédient pour le nombre de personnes choisi.
function fillText(text, recipe, servings) {
  return String(text || '').replace(/\{([\w-]+)\}/g, (m, id) => {
    const ing = recipe.ingredients.find(x => x.id === id);
    return ing ? amount(ing, recipe.servings, servings) : m;
  });
}

// Déroulé par journée : segments de travail et d'attente, totaux en minutes. Une attente longue
// (marinade de 24 h) n'entre pas dans le total : elle fait passer au jour suivant (`rest`).
function plan(recipe) {
  const days = [];
  for (const st of recipe.steps) {
    const day = st.day || 'jour';
    let d = days.find(x => x.day === day);
    if (!d) days.push(d = { day, segs: [], work: 0, total: 0, rest: null });
    if (st.work) { d.segs.push({ kind: 'work', min: st.work }); d.work += st.work; d.total += st.work; }
    if (st.wait) {
      if (st.wait.min > LONG_WAIT) d.rest = st.wait;
      else { d.segs.push({ kind: 'wait', min: st.wait.min }); d.total += st.wait.min; }
    }
  }
  return days;
}
const hasVeille = recipe => recipe.steps.some(s => s.day === 'veille');
const hhmm = min => { const m = ((Math.floor(min / 5) * 5) % 1440 + 1440) % 1440; return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
// Conseil d'heure de départ pour manger à `meal` ("20:00").
function startHint(recipe, meal = '20:00') {
  const [H, M] = meal.split(':').map(Number), mealMin = H * 60 + M;
  const days = plan(recipe), jour = days.find(d => d.day === 'jour'), veille = days.find(d => d.day === 'veille');
  const mealTxt = M ? `${H} h ${String(M).padStart(2, '0')}` : `${H} h`;
  const jourStart = mealMin - (jour ? jour.total : 0);
  if (!veille) return `Pour manger à ${mealTxt}, commence avant ${hhmm(jourStart)}.`;
  const restMin = veille.rest ? veille.rest.min : 0;
  const veilleStart = jourStart - restMin - veille.work;
  // Départ avant minuit : on commence la veille ; sinon tout tient dans la journée.
  if (veilleStart < 0) {
    return `Pour manger demain à ${mealTxt}, commence aujourd'hui avant ${hhmm(veilleStart)}.`;
  }
  return `Pour manger à ${mealTxt}, commence avant ${hhmm(veilleStart)}.`;
}

// Liste de courses : ingrédients additionnés pour plusieurs recettes, rangés par rayon.
// list = [{ id, servings }]. Renvoie [{ rayon, items: [{ key, name, amount, from }] }].
function shopping(recipes, list) {
  const map = new Map();
  for (const { id, servings } of list) {
    const r = recipes.find(x => x.id === id);
    if (!r) continue;
    for (const ing of r.ingredients) {
      if (ing.shop === false) continue;
      const name = ing.shopName || ing.name;
      const key = `${name.toLowerCase()}|${ing.qty == null ? 'texte' : ing.unit || ''}`;
      let it = map.get(key);
      if (!it) map.set(key, it = { key, name, unit: ing.unit, qty: ing.qty == null ? null : 0, text: ing.text || '', rayon: ing.rayon || 'Autres', from: [] });
      if (it.qty != null) it.qty += ing.qty * servings / r.servings;
      if (!it.from.includes(r.title)) it.from.push(r.title);
    }
  }
  const groups = new Map();
  for (const it of map.values()) {
    if (!groups.has(it.rayon)) groups.set(it.rayon, []);
    groups.get(it.rayon).push({ key: it.key, name: it.name, from: it.from,
      amount: it.qty == null ? it.text : fmtAmount(roundQty(it.qty, it.unit), it.unit) });
  }
  const rank = r => { const i = RAYONS.indexOf(r); return i < 0 ? RAYONS.length : i; };
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([rayon, items]) => ({ rayon, items }));
}

// Données de l'utilisateur (user.json) : { notes: {id: {rating, text, u, history: [{t, date, rating}]}},
// servings: {id: {n, u}}, shop: {list, checked, u} }. Chaque partie garde la version modifiée en dernier (u) ;
// l'historique des fois où la recette a été faite est l'union des deux appareils.
function mergeUser(a, b) {
  a = a || {}; b = b || {};
  const out = { notes: {}, servings: {}, shop: null };
  const newer = (x, y) => (!x ? y : !y ? x : (y.u || 0) > (x.u || 0) ? y : x);
  for (const id of new Set([...Object.keys(a.notes || {}), ...Object.keys(b.notes || {})])) {
    const x = (a.notes || {})[id], y = (b.notes || {})[id], n = { ...newer(x, y) };
    const hist = new Map();
    for (const e of [...(x?.history || []), ...(y?.history || [])]) hist.set(e.t, e);
    n.history = [...hist.values()].sort((p, q) => p.t - q.t);
    out.notes[id] = n;
  }
  for (const id of new Set([...Object.keys(a.servings || {}), ...Object.keys(b.servings || {})])) {
    out.servings[id] = newer((a.servings || {})[id], (b.servings || {})[id]);
  }
  out.shop = newer(a.shop, b.shop) || { list: [], checked: {}, u: 0 };
  return out;
}

// Texte à coller dans une conversation avec Claude : la recette, les quantités et l'étape en cours.
function claudeText(recipe, servings, i, timers = []) {
  const st = recipe.steps[i];
  const lines = [
    `Je cuisine « ${recipe.title} » (${recipe.source?.channel || 'recette'}, ${recipe.source?.url || ''}) pour ${servings} personne${servings > 1 ? 's' : ''}.`,
    '', 'Ingrédients :',
    ...recipe.ingredients.map(x => `- ${x.name}${x.group ? ` (${x.group.toLowerCase()})` : ''} : ${amount(x, recipe.servings, servings)}`),
    '', 'Étapes :',
    ...recipe.steps.map((s, k) => `${k + 1}. ${s.title}${k === i ? '   <== JE SUIS ICI' : ''}`),
    '', `Étape en cours (${i + 1}/${recipe.steps.length}) : ${st.title}`, fillText(st.text, recipe, servings),
  ];
  if (timers.length) lines.push('', 'Minuteurs en cours : ' + timers.map(t => `${t.label} (${Math.max(0, Math.ceil((t.end - Date.now()) / 60000))} min restantes)`).join(', '));
  lines.push('', 'Ma question : ');
  return lines.join('\n');
}

if (typeof module !== 'undefined') module.exports = { UNITS, RAYONS, LONG_WAIT, roundQty, fmtNum, fmtAmount, amount, fillText, plan, hasVeille, startHint, shopping, mergeUser, claudeText };
