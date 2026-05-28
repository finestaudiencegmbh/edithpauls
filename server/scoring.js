import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'scoring.json');

export function loadScoringConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

/** Parst die Zahlen aus einer Einkommens-/Geldangabe und liefert einen Mittelwert in € (oder null). */
export function parseAmount(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/\s/g, '');
  // "über 10.000", "mehr als 10000" -> Obergrenze offen
  const openTop = /(über|mehralsals|mehrals|>)/.test(t);
  // alle Zahlen einsammeln (Tausenderpunkt entfernen, Dezimalkomma ignorieren)
  const nums = (t.match(/\d[\d.]*/g) || [])
    .map((n) => parseInt(n.replace(/\./g, ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  if (nums.length === 1) return openTop ? nums[0] * 1.25 : nums[0];
  // Spanne -> Mittelwert der beiden größten plausiblen Werte
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return Math.round((min + max) / 2);
}

function scoreIncome(text, cfg) {
  const mid = parseAmount(text);
  if (mid == null) return null;
  return clamp01(mid / cfg.income.fullScoreAt);
}

function scoreInvested(text, cfg) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (/(^|\b)(nein|keine?|noch nicht|gar nicht|0\b)/.test(t.trim())) return cfg.invested.none;
  const amount = parseAmount(text);
  if (/monat/.test(t)) {
    // monatlicher Sparbetrag: Basiswert, durch Höhe leicht angehoben
    const bump = amount ? clamp01(amount / 1000) * 0.3 : 0;
    return clamp01(cfg.invested.monthly + bump);
  }
  if (amount != null) return clamp01(amount / cfg.invested.fullScoreAt);
  if (/(ja|bereits|schon)/.test(t)) return cfg.invested.yesGeneric;
  return cfg.invested.yesGeneric;
}

function scoreRealEstate(text, cfg) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  for (const rule of cfg.realEstate.rules) {
    if (t.includes(rule.match)) return rule.score;
  }
  return null;
}

function scoreEmployment(text, cfg) {
  if (!text) return null;
  const t = String(text).toLowerCase().trim();
  for (const [key, val] of Object.entries(cfg.employment.scores)) {
    if (t.includes(key)) return val;
  }
  return cfg.employment.default;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function tierFor(score, cfg) {
  if (score == null) return null;
  const tiers = [...cfg.tiers].sort((a, b) => b.min - a.min);
  for (const t of tiers) {
    if (score >= t.min) return t;
  }
  return tiers[tiers.length - 1];
}

/**
 * Berechnet die Lead-Qualität (0..100) aus den VIP-Ticket-Antworten.
 * Fehlende Dimensionen werden ausgeklammert, das Ergebnis auf die
 * vorhandenen Gewichte renormiert – fehlende Antworten ziehen den Score
 * also nicht unfair nach unten.
 */
export function computeQuality(answers, cfg) {
  if (!answers) return null;
  const subs = {
    income: scoreIncome(answers.income, cfg),
    invested: scoreInvested(answers.invested, cfg),
    realEstate: scoreRealEstate(answers.realEstate, cfg),
    employment: scoreEmployment(answers.employment, cfg),
  };

  let sumW = 0;
  let sum = 0;
  const breakdown = {};
  for (const dim of Object.keys(cfg.weights)) {
    const s = subs[dim];
    const w = cfg.weights[dim];
    breakdown[dim] = s == null ? null : Math.round(s * 100);
    if (s != null) {
      sum += s * w;
      sumW += w;
    }
  }
  if (sumW === 0) return null;
  const score = Math.round((sum / sumW) * 100);
  const tier = tierFor(score, cfg);
  return { score, tier: tier?.key ?? null, tierLabel: tier?.label ?? null, breakdown };
}
