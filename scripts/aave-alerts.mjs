// Checa as posições da Aave e envia alertas no ntfy. Roda no GitHub Actions a cada 5 min;
// faz a checagem completa a cada ~1 h, ou a cada execução quando algum HF está abaixo do aviso.
import { ethers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CHAINS, createCore, loopChecks } from '../aave-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, '.aave-state', 'state.json');
const FULL_EVERY_MS = 55 * 60 * 1000;
const URGENT_REPEAT_MS = 15 * 60 * 1000;
const REMIND_MS = 24 * 60 * 60 * 1000;
const FORCE = process.env.FORCE_CHECK === 'true';

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'aave-config.json'), 'utf8'));
let state = { lastFull: 0, low: false, sent: {} };
try { state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; } catch {}

const now = Date.now();
if (!FORCE && !state.low && now - state.lastFull < FULL_EVERY_MS) {
  console.log('Checagem completa não necessária agora.');
  process.exit(0);
}

// Carteiras vêm do Secret AAVE_WALLETS (nunca do repositório). Logs não mostram carteira nem posição: em repo público os logs são públicos.
const raw = (process.env.AAVE_WALLETS || '').trim();
let entries = [];
try { entries = JSON.parse(raw).map(e => (typeof e === 'string' ? { a: e, l: '' } : e)); }
catch { entries = raw.split(/[\s,;]+/).map(a => ({ a, l: '' })); }
entries = entries.filter(e => e && ethers.isAddress(e.a));
const wallets = entries.map(e => e.a);
const labelOf = (w) => { const i = entries.findIndex(e => e.a.toLowerCase() === w.toLowerCase()); return entries[i]?.l || `Carteira ${i + 1}`; };
if (!wallets.length) { console.log('Secret AAVE_WALLETS vazio ou ausente.'); process.exit(0); }
const wid = (w) => crypto.createHash('sha256').update(w.toLowerCase()).digest('hex').slice(0, 10);

let lido = null;
try {
  const r = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
  const v = Number((await r.json())?.data?.smaApr);
  if (isFinite(v) && v > 0) lido = v;
} catch {}
const nativeYield = { ...(lido != null ? { wstETH: lido, stETH: lido } : {}), ...(cfg.nativeYield || {}) };

const core = createCore(ethers);
const alerts = []; // { key, level: 'urgent'|'warn'|'info', title, body }
const active = new Set();
let anyLow = false;
const fmt = (v, d = 2) => v.toFixed(d).replace('.', ',');
const short = (w) => w.slice(0, 6) + '…' + w.slice(-4);

for (const key of Object.keys(CHAINS)) {
  let res;
  try { res = await core.fetchChain(key, wallets, cfg.rpc?.[key] || process.env[`RPC_${key.toUpperCase()}`]); }
  catch (e) { console.error(`Falha ao ler ${CHAINS[key].name} (${e.code || "erro"})`); continue; }
  const lim = { warn: 1.5, urgent: 1.2, ...(cfg.hf?.[key] || {}) };
  const name = CHAINS[key].name;

  for (const a of res.accounts) {
    const who = wallets.length > 1 ? ` (${labelOf(a.wallet)})` : '';
    if (a.debtUsd > 0.01) {
      if (a.hf < lim.warn) anyLow = true;
      if (a.hf < lim.urgent) {
        const k = `hf:${key}:${wid(a.wallet)}:urgent`; active.add(k);
        alerts.push({ key: k, level: 'urgent', repeat: URGENT_REPEAT_MS, title: `Aave ${name}${who}: HF ${fmt(a.hf)}`, body: `Health Factor abaixo de ${fmt(lim.urgent)}. Risco de liquidação.` });
      } else if (a.hf < lim.warn) {
        const k = `hf:${key}:${wid(a.wallet)}:warn`; active.add(k);
        alerts.push({ key: k, level: 'warn', repeat: Infinity, title: `Aave ${name}${who}: HF ${fmt(a.hf)}`, body: `Health Factor abaixo de ${fmt(lim.warn)}.` });
      }
    }
    for (const p of a.positions.filter(p => p.side === 'borrow')) {
      const max = cfg.borrowApyMax?.[p.symbol];
      if (max != null && max !== '' && p.apy > Number(max)) {
        const k = `apy:${key}:${wid(a.wallet)}:${p.symbol}`; active.add(k);
        alerts.push({ key: k, level: 'info', repeat: REMIND_MS, title: `Aave ${name}${who}: borrow ${p.symbol} ${fmt(p.apy)}%`, body: `APY de empréstimo acima do limite de ${fmt(Number(max), 1)}%.` });
      }
    }
    for (const l of loopChecks(a, nativeYield)) {
      if (l.spread <= 0) {
        const k = `loop:${key}:${wid(a.wallet)}:${l.group}`; active.add(k);
        alerts.push({ key: k, level: 'info', repeat: REMIND_MS, title: `Aave ${name}${who}: loop ${l.group} não compensa`, body: `Depósito ${fmt(l.supplyApy)}% vs empréstimo ${fmt(l.borrowApy)}% (spread ${fmt(l.spread)} p.p.).` });
      }
    }
  }
}

// Envia o que é novo ou precisa repetir; esquece o que voltou ao normal
const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
const topic = process.env.NTFY_TOPIC;
let sentCount = 0;
const PRIORITY = { urgent: 'urgent', warn: 'high', info: 'default' };
const TAGS = { urgent: 'rotating_light', warn: 'warning', info: 'chart_with_upwards_trend' };

for (const al of alerts) {
  const last = state.sent[al.key];
  if (last && now - last < al.repeat) continue;
  if (!topic) { console.log('Secret NTFY_TOPIC ausente: alerta não enviado.'); continue; }
  try {
    const q = new URLSearchParams({ title: al.title, priority: PRIORITY[al.level], tags: TAGS[al.level] });
    const r = await fetch(`${server}/${topic}?${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
      body: al.body,
    });
    if (!r.ok) throw new Error(String(r.status));
    state.sent[al.key] = now;
    sentCount++;
  } catch (e) { console.error('Falha no ntfy:', e.message); }
}
for (const k of Object.keys(state.sent)) if (!active.has(k)) delete state.sent[k];

state.lastFull = now;
state.low = anyLow;
fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
console.log(`Checagem concluída. Alertas enviados: ${sentCount}.`);
process.exit(0);
