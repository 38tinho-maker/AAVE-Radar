import { ethers } from './ethers.min.js';
import { sealedBox } from './sealbox.js';
import { VERSION, CHAINS, GROUPS, groupOf, createCore, netYieldUsd, simulateHf, liquidationInfo, loopChecks, betterRates, effApy } from './aave-core.js';

const core = createCore(ethers);
const LS = localStorage;
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');

// ---------- Idioma ----------
const STR = {
  pt: {
    netWorth: 'Patrimônio líquido', netYield: 'Rendimento líquido', perDay: '/dia', apy: 'APY',
    supply: 'depósito', borrow: 'empréstimo', liqAt: 'Liquida se {sym} ≤ {price} (−{pct})', liqNever: 'Queda do {g} não liquida',
    depeg: 'Correlacionado: liquida se {sym} descolar −{pct}', depegNever: 'Correlacionado: sem risco de preço relevante',
    warnAt: 'aviso em {v}', loop: 'Loop {g}: spread {v}', better: '{sym} {side} na {chain}: {apy} ({diff})',
    apyHigh: '{sym} borrow acima do limite: {apy} > {max}', loopBad: 'Loop {g} deixou de compensar ({v})',
    sim: 'Simulador de queda', asset: 'Ativo', drop: 'Queda', now: 'agora', simulated: 'simulado', updated: 'Atualizado {t}',
    loading: 'Carregando posições…', noWallets: 'Adicione suas carteiras em Ajustes para começar.', noPos: 'Nenhuma posição na Aave nas carteiras configuradas.',
    chainErr: '{chain}: não foi possível ler ({e})', settings: 'Ajustes', back: 'Voltar', appearance: 'Aparência', theme: 'Tema',
    light: 'Claro', dark: 'Escuro', auto: 'Auto', language: 'Idioma', security: 'Segurança', faceId: 'Face ID', changePin: 'Trocar PIN', lockNow: 'Bloquear agora',
    hfAlerts: 'Alertas de Health Factor', network: 'Rede', warn: 'Aviso', urgent: 'Urgente', apyAlerts: 'Limite de APY de borrow (%)', apyHint: 'Deixe vazio para não alertar.',
    rateNotices: 'Avisos de taxa melhor', minDiff: 'Diferença mínima (p.p.)', staking: 'Rendimento de staking (%/ano)', stakingHint: 'Somado ao APY de LSTs, cujo rendimento vem no preço. wstETH é lido da Lido automaticamente.',
    wallets: 'Carteiras', walletsHint: 'Um endereço por linha. Ficam só neste aparelho e, para os alertas, num Secret criptografado do GitHub. Nunca no repositório.', github: 'Salvar no GitHub', repo: 'Repositório (usuário/repo)', token: 'Token do GitHub',
    tokenHint: 'Token fine-grained só neste repo, com Contents e Secrets em Read and write. Fica salvo neste aparelho, atrás do PIN.',
    save: 'Salvar', saving: 'Salvando…', saved: 'Salvo. Os alertas usam os novos limites na próxima checagem.', saveErr: 'Não foi possível salvar: {e}',
    badWallet: 'Endereço inválido: {w}', savedLocal: 'Salvo neste aparelho. Para os alertas usarem as mudanças, informe o repositório e o token.', minutes: 'há {n} min', justNow: 'agora', version: 'v{v}', autoLido: 'auto (Lido)',
    allEth: 'ETH e derivados', allBtc: 'BTC e derivados', allPol: 'POL e derivados',
  },
  en: {
    netWorth: 'Net worth', netYield: 'Net yield', perDay: '/day', apy: 'APY',
    supply: 'supply', borrow: 'borrow', liqAt: 'Liquidated if {sym} ≤ {price} (−{pct})', liqNever: '{g} drop does not liquidate',
    depeg: 'Correlated: liquidated if {sym} depegs −{pct}', depegNever: 'Correlated: no meaningful price risk',
    warnAt: 'warning at {v}', loop: '{g} loop: spread {v}', better: '{sym} {side} on {chain}: {apy} ({diff})',
    apyHigh: '{sym} borrow above limit: {apy} > {max}', loopBad: '{g} loop no longer pays ({v})',
    sim: 'Price drop simulator', asset: 'Asset', drop: 'Drop', now: 'now', simulated: 'simulated', updated: 'Updated {t}',
    loading: 'Loading positions…', noWallets: 'Add your wallets in Settings to get started.', noPos: 'No Aave positions in the configured wallets.',
    chainErr: "{chain}: couldn't load ({e})", settings: 'Settings', back: 'Back', appearance: 'Appearance', theme: 'Theme',
    light: 'Light', dark: 'Dark', auto: 'Auto', language: 'Language', security: 'Security', faceId: 'Face ID', changePin: 'Change PIN', lockNow: 'Lock now',
    hfAlerts: 'Health Factor alerts', network: 'Network', warn: 'Warning', urgent: 'Urgent', apyAlerts: 'Borrow APY limit (%)', apyHint: 'Leave empty for no alert.',
    rateNotices: 'Better rate notices', minDiff: 'Minimum difference (pp)', staking: 'Staking yield (%/yr)', stakingHint: "Added to LST APY, since their yield is in the price. wstETH is read from Lido automatically.",
    wallets: 'Wallets', walletsHint: 'One address per line. Stored only on this device and, for alerts, in an encrypted GitHub Secret. Never in the repository.', github: 'Save to GitHub', repo: 'Repository (user/repo)', token: 'GitHub token',
    tokenHint: 'Fine-grained token for this repo only, with Contents and Secrets set to Read and write. Stored on this device, behind the PIN.',
    save: 'Save', saving: 'Saving…', saved: 'Saved. Alerts use the new limits on the next check.', saveErr: "Couldn't save: {e}",
    badWallet: 'Invalid address: {w}', savedLocal: 'Saved on this device. Enter the repository and token so alerts use the changes.', minutes: '{n} min ago', justNow: 'just now', version: 'v{v}', autoLido: 'auto (Lido)',
    allEth: 'ETH and derivatives', allBtc: 'BTC and derivatives', allPol: 'POL and derivatives',
  },
};
let lang = LS.getItem('aave.lang') === 'en' ? 'en' : 'pt';
const t = (k, vars = {}) => (STR[lang][k] || k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
const locale = () => (lang === 'en' ? 'en-US' : 'pt-BR');
const usd = (v, d = 0) => (v < 0 ? '−' : '') + 'US$ ' + Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const pp = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + (lang === 'en' ? ' pp' : ' p.p.');
const num = (v, d = 2) => (isFinite(v) ? v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '∞');
const short = (w) => w.slice(0, 6) + '…' + w.slice(-4);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Estado ----------
const DEFAULT_CFG = { hf: {}, borrowApyMax: {}, rateDiffMin: 1, rateNotices: {}, nativeYield: {}, rpc: {} };
let cfg = structuredClone(DEFAULT_CFG);
let data = null; // { chains: {key: {reserves, accounts, error}}, at }
let lidoApr = null;
const getWallets = () => JSON.parse(LS.getItem('aave.wallets') || '[]');
let sim = { target: 'ETH', drop: 20 };
let mode = 'main';
let loading = false;

const hfLimits = (chain) => ({ warn: 1.5, urgent: 1.2, ...(cfg.hf[chain] || {}) });
const native = () => ({ ...cfg.nativeYield, ...(lidoApr != null && cfg.nativeYield.wstETH == null ? { wstETH: lidoApr, stETH: lidoApr } : {}) });

async function loadConfig() {
  let remote = null;
  try {
    const r = await fetch('./aave-config.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) remote = await r.json();
  } catch {}
  // Logo após salvar, o GitHub Pages demora ~1 min para servir a versão nova
  const local = JSON.parse(LS.getItem('aave.cfg.saved') || 'null');
  const useLocal = local && Date.now() - local.at < 15 * 60 * 1000;
  cfg = { ...structuredClone(DEFAULT_CFG), ...(useLocal ? local.cfg : remote || local?.cfg || {}) };
  // Carteiras ficam só neste aparelho (e no Secret do GitHub para os alertas)
  if (!getWallets().length && Array.isArray(cfg.wallets) && cfg.wallets.length) LS.setItem('aave.wallets', JSON.stringify(cfg.wallets));
  delete cfg.wallets;
}

async function loadLido() {
  try {
    const r = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma');
    const j = await r.json();
    const v = Number(j?.data?.smaApr);
    if (isFinite(v) && v > 0) lidoApr = v;
  } catch {}
}

async function refresh() {
  if (loading) return;
  loading = true;
  $('#btnRefresh').classList.add('spin');
  if (!data && mode === 'main') render();
  const wallets = getWallets().filter(w => ethers.isAddress(w));
  const chains = {};
  await Promise.all(Object.keys(CHAINS).map(async (k) => {
    try { chains[k] = await core.fetchChain(k, wallets, cfg.rpc?.[k]); }
    catch (e) { console.error(k, e); chains[k] = { reserves: [], accounts: [], error: (e.shortMessage || e.message || 'erro').slice(0, 80) }; }
  }));
  data = { chains, at: Date.now() };
  loading = false;
  $('#btnRefresh').classList.remove('spin');
  if (mode === 'main') render();
}

// ---------- Tela principal ----------
function hfClass(hf, chain) {
  const l = hfLimits(chain);
  return hf < l.urgent ? 'bad' : hf < l.warn ? 'warn' : 'ok';
}
const ICON = {
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
};

function allAccounts() {
  return data ? Object.values(data.chains).flatMap(c => c.accounts) : [];
}
function allReserves() {
  return data ? Object.values(data.chains).flatMap(c => c.reserves) : [];
}

function renderMain() {
  const wallets = getWallets().filter(w => ethers.isAddress(w));
  if (!wallets.length) return `<div class="card empty">${t('noWallets')}</div>`;
  if (!data) return `<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="foot">${t('loading')}</div>`;

  const accs = allAccounts();
  const nv = native();
  const multiWallet = wallets.length > 1;
  const netWorth = accs.reduce((s, a) => s + a.positions.reduce((x, p) => x + (p.side === 'supply' ? p.usd : -p.usd), 0), 0);
  const yearly = accs.reduce((s, a) => s + netYieldUsd(a, nv), 0);
  const netApy = netWorth > 0 ? yearly / netWorth * 100 : 0;

  let h = `<div class="metrics">
    <div class="metric"><div class="lbl">${t('netWorth')}</div><div class="big">${usd(netWorth)}</div></div>
    <div class="metric"><div class="lbl">${t('netYield')}</div><div class="big ${yearly >= 0 ? 'pos' : 'neg'}">${yearly >= 0 ? '+' : ''}${usd(yearly / 365, 2)}${t('perDay')}</div><div class="sub">${t('apy')} ${pct(netApy)}</div></div>
  </div>`;

  Object.entries(data.chains).forEach(([k, c]) => { if (c.error) h += `<div class="note warn" style="margin-bottom:10px">${ICON.alert}<span>${esc(t('chainErr', { chain: CHAINS[k].name, e: c.error }))}</span></div>`; });

  if (!accs.length) return h + `<div class="card empty">${t('noPos')}</div>` + footer();

  const sorted = [...accs].sort((a, b) => a.hf - b.hf);
  for (const a of sorted) {
    const lim = hfLimits(a.chain);
    const cls = a.debtUsd > 0.01 ? hfClass(a.hf, a.chain) : 'ok';
    const barW = isFinite(a.hf) ? Math.max(2, Math.min(100, (a.hf - 1) / 2 * 100)) : 100;
    const barC = cls === 'bad' ? 'var(--red)' : cls === 'warn' ? 'var(--amber)' : 'var(--green)';
    h += `<div class="card"><div class="ch"><span class="ct">${CHAINS[a.chain].name}${multiWallet ? `<span class="cw">${short(a.wallet)}</span>` : ''}${a.eMode ? '<span class="tag">E-Mode</span>' : ''}</span>
      ${a.debtUsd > 0.01 ? `<span class="pill ${cls}">HF ${num(a.hf)}</span>` : ''}</div>`;

    if (a.debtUsd > 0.01) {
      h += `<div class="bar"><i style="width:${barW}%;background:${barC}"></i></div>`;
      const li = liquidationInfo(a);
      let line = '';
      if (li?.kind === 'price') line = t('liqAt', { sym: li.symbol, price: usd(li.price, li.price < 10 ? 2 : 0), pct: pct(li.drop * 100, 0) });
      else if (li?.kind === 'depeg') line = li.drop != null ? t('depeg', { sym: li.symbol, pct: pct(li.drop * 100, 1) }) : t('depegNever');
      h += `<div class="lbl">${line}${line ? ' · ' : ''}${t('warnAt', { v: num(lim.warn, 2) })}</div>`;
    }

    h += `<div style="margin-top:6px">`;
    for (const p of a.positions) {
      const ny = nv[p.symbol] || 0;
      h += `<div class="row"><span>${esc(p.symbol)}<span class="side">${t(p.side)}</span></span>
        <span class="r">${usd(p.usd)} · <span class="${p.side === 'supply' ? 'pos' : 'neg'}">${pct(effApy(p, nv), 2)}</span>${ny ? `<span class="side">${pct(p.apy, 2)} + ${pct(ny, 1)} staking</span>` : ''}</span></div>`;
    }
    h += `</div>`;

    for (const l of loopChecks(a, nv)) {
      h += `<div class="lbl" style="margin-top:4px">${t('loop', { g: l.group, v: pp(l.spread) })}</div>`;
      if (l.spread <= 0) h += note('bad', ICON.alert, t('loopBad', { g: l.group, v: pp(l.spread) }));
    }
    for (const p of a.positions.filter(p => p.side === 'borrow')) {
      const max = cfg.borrowApyMax?.[p.symbol];
      if (max != null && max !== '' && p.apy > Number(max)) h += note('warn', ICON.alert, t('apyHigh', { sym: p.symbol, apy: pct(p.apy, 2), max: pct(Number(max), 1) }));
    }
    for (const b of betterRates(a, allReserves(), Number(cfg.rateDiffMin) || 0, cfg.rateNotices || {})) {
      h += note('info', ICON.swap, t('better', { sym: b.symbol, side: t(b.side), chain: CHAINS[b.chain].name, apy: pct(b.apy, 2), diff: pp(b.side === 'supply' ? b.diff : -b.diff) }));
    }
    h += `</div>`;
  }

  h += renderSim(sorted.filter(a => a.debtUsd > 0.01));
  return h + footer();
}

function note(cls, icon, text) {
  return `<div class="note ${cls}">${icon}<span>${esc(text)}</span></div>`;
}

function simTargets(accs) {
  const syms = new Set(accs.flatMap(a => a.positions.map(p => p.symbol)));
  const groups = [];
  const labels = { ETH: 'allEth', BTC: 'allBtc', POL: 'allPol' };
  for (const g of ['ETH', 'BTC', 'POL']) if ([...syms].some(s => GROUPS[g].includes(s))) groups.push({ v: g, l: t(labels[g]) });
  [...syms].sort().forEach(s => groups.push({ v: 'sym:' + s, l: s }));
  return groups;
}

function renderSim(accs) {
  if (!accs.length) return '';
  const opts = simTargets(accs);
  if (!opts.find(o => o.v === sim.target)) sim.target = opts[0]?.v;
  return `<div class="card" id="simCard"><div class="ct" style="margin-bottom:10px">${t('sim')}</div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
      <select id="simTarget" style="flex:1">${opts.map(o => `<option value="${esc(o.v)}"${o.v === sim.target ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>
    </div>
    <div style="display:flex;gap:10px;align-items:center"><span class="lbl">${t('drop')}</span><input type="range" id="simDrop" min="0" max="80" step="1" value="${sim.drop}"><span id="simDropV" style="font-weight:600;min-width:44px;text-align:right">−${sim.drop}%</span></div>
    <div id="simRes" style="margin-top:8px"></div></div>`;
}

function updateSim() {
  const res = $('#simRes');
  if (!res) return;
  const accs = allAccounts().filter(a => a.debtUsd > 0.01).sort((a, b) => a.hf - b.hf);
  const syms = sim.target?.startsWith('sym:') ? [sim.target.slice(4)] : (GROUPS[sim.target] || []);
  const multi = getWallets().length > 1;
  $('#simDropV').textContent = '−' + sim.drop + '%';
  res.innerHTML = accs.map(a => {
    const s = simulateHf(a, syms, sim.drop / 100);
    const cls = hfClass(s, a.chain);
    return `<div class="row"><span>${CHAINS[a.chain].name}${multi ? `<span class="cw">${short(a.wallet)}</span>` : ''}</span>
      <span class="r"><span class="lbl">${num(a.hf)} →</span> <span class="pill ${cls}">${s < 1 ? 'LIQ ' : ''}${num(s)}</span></span></div>`;
  }).join('');
}

function footer() {
  const mins = data ? Math.floor((Date.now() - data.at) / 60000) : 0;
  return `<div class="foot">${t('updated', { t: mins < 1 ? t('justNow') : t('minutes', { n: mins }) })} · ${t('version', { v: VERSION })}</div>`;
}

// ---------- Ajustes ----------
let draft = null;

function seg(id, items, val) {
  return `<div class="seg" id="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${v === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function ghRepoDefault() {
  const saved = LS.getItem('aave.gh.repo');
  if (saved) return saved;
  if (location.hostname.endsWith('.github.io')) {
    const owner = location.hostname.split('.')[0];
    const first = location.pathname.split('/').filter(Boolean)[0];
    return `${owner}/${first || location.hostname}`;
  }
  return '';
}

function renderSettings() {
  draft = draft || structuredClone(cfg);
  const accs = allAccounts();
  const borrowed = new Set([...accs.flatMap(a => a.positions.filter(p => p.side === 'borrow').map(p => p.symbol)), ...Object.keys(draft.borrowApyMax || {})]);
  const pairs = [...new Set([...accs.flatMap(a => a.positions.map(p => `${p.symbol}:${p.side}`)), ...Object.keys(draft.rateNotices || {})])].sort();
  const lsts = new Set(accs.flatMap(a => a.positions.map(p => p.symbol)).filter(s => (groupOf(s) === 'ETH' && !['WETH', 'ETH'].includes(s)) || draft.nativeYield?.[s] != null));
  const theme = LS.getItem('aave.theme') || 'auto';
  const fid = window.DashLock?.hasFaceId();

  let h = `<div class="sec">${t('appearance')}</div><div class="card">
      <div class="lbl" style="margin-bottom:6px">${t('theme')}</div>${seg('segTheme', [['light', t('light')], ['dark', t('dark')], ['auto', t('auto')]], theme)}
      <div class="lbl" style="margin:12px 0 6px">${t('language')}</div>${seg('segLang', [['pt', 'Português'], ['en', 'English']], lang)}
    </div>
    <div class="sec">${t('security')}</div><div class="card">
      <div class="row"><span>${t('faceId')}</span><button class="tg ${fid ? 'on' : ''}" id="tgFace" aria-label="${t('faceId')}"></button></div>
      <button class="btn2" id="btnPin">${t('changePin')}</button><button class="btn2" id="btnLock">${t('lockNow')}</button>
    </div>
    <div class="sec">${t('hfAlerts')}</div><div class="card">
      <div class="hf2"><span class="lbl">${t('network')}</span><span class="h">${t('warn')}</span><span class="h">${t('urgent')}</span></div>
      ${Object.keys(CHAINS).map(k => { const l = { warn: 1.5, urgent: 1.2, ...(draft.hf[k] || {}) }; return `<div class="hf2"><span>${CHAINS[k].name}</span><input type="number" step="0.05" min="1" data-hf="${k}:warn" value="${l.warn}"><input type="number" step="0.05" min="1" data-hf="${k}:urgent" value="${l.urgent}"></div>`; }).join('')}
    </div>
    <div class="sec">${t('apyAlerts')}</div><div class="card">
      ${[...borrowed].sort().map(s => `<div class="row"><span>${esc(s)}</span><input type="number" step="0.5" min="0" data-apy="${esc(s)}" value="${draft.borrowApyMax?.[s] ?? ''}"></div>`).join('') || `<div class="lbl">—</div>`}
      <div class="lbl" style="margin-top:6px">${t('apyHint')}</div>
    </div>
    <div class="sec">${t('rateNotices')}</div><div class="card">
      <div class="row"><span>${t('minDiff')}</span><input type="number" step="0.1" min="0" id="minDiff" value="${draft.rateDiffMin ?? 1}"></div>
      ${pairs.map(pk => { const [s, side] = pk.split(':'); const on = draft.rateNotices?.[pk] !== false; return `<div class="row"><span>${esc(s)}<span class="side">${t(side)}</span></span><button class="tg ${on ? 'on' : ''}" data-rate="${esc(pk)}" aria-label="${esc(s)}"></button></div>`; }).join('')}
    </div>
    ${lsts.size ? `<div class="sec">${t('staking')}</div><div class="card">
      ${[...lsts].sort().map(s => `<div class="row"><span>${esc(s)}</span><input type="number" step="0.1" min="0" data-ny="${esc(s)}" value="${draft.nativeYield?.[s] ?? ''}" placeholder="${s === 'wstETH' && lidoApr != null ? num(lidoApr, 1) : ''}"></div>`).join('')}
      <div class="lbl" style="margin-top:6px">${t('stakingHint')}</div>
    </div>` : ''}
    <div class="sec">${t('wallets')}</div><div class="card">
      <textarea id="wallets" spellcheck="false" autocapitalize="off" autocomplete="off">${esc((draft.wallets || getWallets()).join('\n'))}</textarea>
      <div class="lbl" style="margin-top:6px">${t('walletsHint')}</div>
    </div>
    <div class="sec">${t('github')}</div><div class="card">
      <div class="lbl" style="margin-bottom:6px">${t('repo')}</div><input type="text" id="ghRepo" style="width:100%" autocapitalize="off" value="${esc(ghRepoDefault())}">
      <div class="lbl" style="margin:12px 0 6px">${t('token')}</div><input type="password" id="ghToken" style="width:100%" autocomplete="off" value="${esc(LS.getItem('aave.gh.token') || '')}">
      <div class="lbl" style="margin-top:6px">${t('tokenHint')}</div>
    </div>
    <button class="btn" id="btnSave">${t('save')}</button><div class="msg" id="saveMsg"></div>
    <div class="foot">${t('version', { v: VERSION })}</div>`;
  return h;
}

function bindSettings() {
  $('#segTheme').onclick = (e) => {
    const v = e.target.dataset.v; if (!v) return;
    LS.setItem('aave.theme', v);
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    render();
  };
  $('#segLang').onclick = (e) => {
    const v = e.target.dataset.v; if (!v) return;
    collectDraft(); lang = v; LS.setItem('aave.lang', v); document.documentElement.lang = v === 'en' ? 'en' : 'pt-BR'; render();
  };
  $('#tgFace').onclick = async (e) => {
    if (window.DashLock.hasFaceId()) { window.DashLock.disableFaceId(); e.target.classList.remove('on'); }
    else if (await window.DashLock.enableFaceId()) e.target.classList.add('on');
  };
  $('#btnPin').onclick = () => window.DashLock.changePin();
  $('#btnLock').onclick = () => window.DashLock.lock();
  view.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#btnSave').onclick = save;
}

function collectDraft() {
  if (!draft || !$('#wallets')) return;
  view.querySelectorAll('[data-hf]').forEach(i => {
    const [k, f] = i.dataset.hf.split(':');
    draft.hf[k] = draft.hf[k] || {};
    const v = parseFloat(i.value); if (isFinite(v)) draft.hf[k][f] = v;
  });
  draft.borrowApyMax = {};
  view.querySelectorAll('[data-apy]').forEach(i => { const v = parseFloat(i.value); if (isFinite(v)) draft.borrowApyMax[i.dataset.apy] = v; });
  draft.rateNotices = {};
  view.querySelectorAll('[data-rate]').forEach(b => { if (!b.classList.contains('on')) draft.rateNotices[b.dataset.rate] = false; });
  draft.rateDiffMin = parseFloat($('#minDiff').value) || 0;
  draft.nativeYield = { ...(draft.nativeYield || {}) };
  view.querySelectorAll('[data-ny]').forEach(i => { const v = parseFloat(i.value); if (isFinite(v)) draft.nativeYield[i.dataset.ny] = v; else delete draft.nativeYield[i.dataset.ny]; });
  draft.wallets = $('#wallets').value.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  LS.setItem('aave.gh.repo', $('#ghRepo').value.trim());
  LS.setItem('aave.gh.token', $('#ghToken').value.trim());
}

async function save() {
  collectDraft();
  const msg = $('#saveMsg');
  const bad = draft.wallets.find(w => !ethers.isAddress(w));
  if (bad) { msg.className = 'msg neg'; msg.textContent = t('badWallet', { w: bad }); return; }
  draft.wallets = draft.wallets.map(w => ethers.getAddress(w));
  for (const k of Object.keys(draft.hf)) if (draft.hf[k].urgent > draft.hf[k].warn) [draft.hf[k].urgent, draft.hf[k].warn] = [draft.hf[k].warn, draft.hf[k].urgent];
  const repo = LS.getItem('aave.gh.repo'), token = LS.getItem('aave.gh.token');
  if (!repo || !token) {
    // Sem token: salva só neste aparelho (app funciona; alertas não recebem as mudanças)
    const changed = JSON.stringify(getWallets()) !== JSON.stringify(draft.wallets);
    LS.setItem('aave.wallets', JSON.stringify(draft.wallets));
    LS.removeItem('aave.secretOk');
    cfg = structuredClone(draft); delete cfg.wallets;
    LS.setItem('aave.cfg.saved', JSON.stringify({ at: Date.now(), cfg }));
    msg.className = 'msg warn'; msg.textContent = t('savedLocal');
    if (changed) { data = null; refresh(); }
    return;
  }
  msg.className = 'msg'; msg.textContent = t('saving');
  try {
    const api = `https://api.github.com/repos/${repo}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
    const fail = async (r) => { throw new Error(`${r.status} ${(await r.json().catch(() => ({}))).message || ''}`.trim()); };
    const wallets = draft.wallets;
    const walletsChanged = JSON.stringify(getWallets()) !== JSON.stringify(wallets);

    // 1) Carteiras: Secret criptografado (nunca vai para arquivo do repo)
    if (walletsChanged || !LS.getItem('aave.secretOk')) {
      const pk = await fetch(`${api}/actions/secrets/public-key`, { headers });
      if (!pk.ok) await fail(pk);
      const { key, key_id } = await pk.json();
      const r = await fetch(`${api}/actions/secrets/AAVE_WALLETS`, { method: 'PUT', headers, body: JSON.stringify({ encrypted_value: sealedBox(key, wallets.join(',')), key_id }) });
      if (!r.ok) await fail(r);
      LS.setItem('aave.secretOk', '1');
    }
    LS.setItem('aave.wallets', JSON.stringify(wallets));

    // 2) Limites: aave-config.json (sem carteiras)
    const pub = structuredClone(draft); delete pub.wallets;
    const url = `${api}/contents/aave-config.json`;
    const cur = await fetch(url, { headers, cache: 'no-store' });
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const body = JSON.stringify(pub, null, 2) + '\n';
    const content = btoa(String.fromCharCode(...new TextEncoder().encode(body)));
    const r = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ message: 'Atualiza limites', content, sha }) });
    if (!r.ok) await fail(r);

    cfg = pub;
    LS.setItem('aave.cfg.saved', JSON.stringify({ at: Date.now(), cfg }));
    msg.className = 'msg pos'; msg.textContent = t('saved');
    if (walletsChanged) { data = null; refresh(); }
  } catch (e) {
    msg.className = 'msg neg'; msg.textContent = t('saveErr', { e: e.message });
  }
}

// ---------- Render ----------
function render() {
  $('#btnSettings').setAttribute('aria-label', t('settings'));
  if (mode === 'settings') {
    view.innerHTML = renderSettings();
    bindSettings();
  } else {
    view.innerHTML = renderMain();
    const tg = $('#simTarget'), dr = $('#simDrop');
    if (tg) { tg.onchange = () => { sim.target = tg.value; updateSim(); }; dr.oninput = () => { sim.drop = Number(dr.value); updateSim(); }; updateSim(); }
  }
}

$('#btnSettings').onclick = () => {
  if (mode === 'settings') { collectDraft(); mode = 'main'; draft = null; }
  else mode = 'settings';
  $('#btnSettings').classList.toggle('on', mode === 'settings');
  render();
  window.scrollTo(0, 0);
};
$('#btnRefresh').onclick = () => { if (mode !== 'main') { mode = 'main'; draft = null; } refresh(); };

document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
await Promise.all([loadConfig(), loadLido()]);
render();
refresh();
setInterval(() => { if (!document.hidden && mode === 'main') refresh(); }, 5 * 60 * 1000);
