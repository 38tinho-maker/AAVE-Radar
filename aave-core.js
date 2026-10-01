// Núcleo Aave v3: leitura on-chain (browser e Node). Recebe a lib ethers v6 por parâmetro.
export const VERSION = '1.3';

export const CHAINS = {
  ethereum: { name: 'Ethereum', id: 1, pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2', rpc: 'https://ethereum-rpc.publicnode.com' },
  arbitrum: { name: 'Arbitrum', id: 42161, pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD', oracle: '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7', rpc: 'https://arbitrum-one-rpc.publicnode.com' },
  base:     { name: 'Base',     pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5', oracle: '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156', rpc: 'https://base-rpc.publicnode.com' },
  polygon:  { name: 'Polygon',  pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD', oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1', rpc: 'https://polygon-bor-rpc.publicnode.com' },
};

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

// Ativos que andam juntos no preço (para simulador e loop)
export const GROUPS = {
  ETH: ['WETH', 'ETH', 'wstETH', 'weETH', 'rETH', 'cbETH', 'ezETH', 'osETH', 'ETHx', 'rsETH', 'wrsETH', 'sfrxETH', 'tETH'],
  BTC: ['WBTC', 'cbBTC', 'tBTC', 'LBTC', 'eBTC', 'FBTC'],
  USD: ['USDC', 'USDT', 'USDT0', 'DAI', 'USDC.e', 'USDbC', 'GHO', 'USDS', 'sDAI', 'sUSDe', 'USDe', 'PYUSD', 'FRAX', 'LUSD', 'crvUSD', 'RLUSD', 'EURC'],
  POL: ['WPOL', 'WMATIC', 'POL', 'MaticX', 'stMATIC'],
};
export function groupOf(sym) {
  for (const [g, list] of Object.entries(GROUPS)) if (list.includes(sym)) return g;
  return sym;
}

const ABI = [
  'function getReservesList() view returns (address[])',
  'function getReserveData(address) view returns (tuple(tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
  'function getUserAccountData(address) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getUserEMode(address) view returns (uint256)',
  'function getAssetsPrices(address[]) view returns (uint256[])',
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])',
];

const SECONDS_PER_YEAR = 31536000;
const rayToApy = (ray) => {
  const apr = Number(ray) / 1e27;
  return (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
};
const bits = (data, start, len) => Number((data >> BigInt(start)) & ((1n << BigInt(len)) - 1n));

export function createCore(ethers) {
  const iface = new ethers.Interface(ABI);

  async function multicall(provider, calls, chunk = 120) {
    const mc = new ethers.Contract(MULTICALL3, ABI, provider);
    const out = [];
    for (let i = 0; i < calls.length; i += chunk) {
      const part = calls.slice(i, i + chunk);
      const res = await mc.aggregate3.staticCall(part.map(c => ({ target: c.to, allowFailure: true, callData: iface.encodeFunctionData(c.fn, c.args || []) })));
      res.forEach((r, j) => {
        if (!r.success || r.returnData === '0x') return out.push(null);
        try { out.push(iface.decodeFunctionResult(part[j].fn, r.returnData)); } catch { out.push(null); }
      });
    }
    return out;
  }

  function decodeSymbol(raw) {
    return raw ? String(raw[0]) : '?';
  }

  // Lê reservas (taxas, preços) e posições das carteiras numa rede
  async function fetchChain(key, wallets, rpcOverride) {
    const c = CHAINS[key];
    const provider = new ethers.JsonRpcProvider(rpcOverride || c.rpc, ethers.Network.from(c.id), { staticNetwork: true, batchMaxCount: 1 });
    try {
    const pool = new ethers.Contract(c.pool, ABI, provider);
    const assets = [...(await pool.getReservesList())];

    const [rdata, syms, prices] = await Promise.all([
      multicall(provider, assets.map(a => ({ to: c.pool, fn: 'getReserveData', args: [a] }))),
      multicall(provider, assets.map(a => ({ to: a, fn: 'symbol' }))),
      multicall(provider, [{ to: c.oracle, fn: 'getAssetsPrices', args: [assets] }]),
    ]);
    const priceList = prices[0] ? prices[0][0] : [];

    const reserves = assets.map((asset, i) => {
      const d = rdata[i] && rdata[i][0];
      if (!d) return null;
      const cfg = BigInt(d.configuration.data);
      return {
        asset, chain: key,
        symbol: decodeSymbol(syms[i]),
        decimals: bits(cfg, 48, 8),
        lt: bits(cfg, 16, 16) / 1e4,
        active: bits(cfg, 56, 1) === 1,
        frozen: bits(cfg, 57, 1) === 1,
        borrowing: bits(cfg, 58, 1) === 1,
        paused: bits(cfg, 60, 1) === 1,
        supplyApy: rayToApy(d.currentLiquidityRate),
        borrowApy: rayToApy(d.currentVariableBorrowRate),
        aToken: d.aTokenAddress,
        debtToken: d.variableDebtTokenAddress,
        priceUsd: priceList[i] ? Number(priceList[i]) / 1e8 : 0,
      };
    }).filter(Boolean);

    // Conta de cada carteira
    const acc = await multicall(provider, wallets.flatMap(w => [
      { to: c.pool, fn: 'getUserAccountData', args: [w] },
      { to: c.pool, fn: 'getUserEMode', args: [w] },
    ]));
    const accounts = [];
    const withPos = [];
    wallets.forEach((w, i) => {
      const a = acc[i * 2];
      if (!a) return;
      const coll = Number(a.totalCollateralBase) / 1e8;
      const debt = Number(a.totalDebtBase) / 1e8;
      if (coll < 0.01 && debt < 0.01) return;
      const hfRaw = a.healthFactor;
      const hf = hfRaw > 10n ** 30n ? Infinity : Number(hfRaw) / 1e18;
      const e = acc[i * 2 + 1];
      accounts.push({ wallet: w, chain: key, collUsd: coll, debtUsd: debt, lt: Number(a.currentLiquidationThreshold) / 1e4, hf, eMode: e ? Number(e[0]) : 0, positions: [] });
      withPos.push(accounts.length - 1);
    });

    if (withPos.length) {
      const calls = [];
      withPos.forEach(ai => reserves.forEach(r => {
        calls.push({ to: r.aToken, fn: 'balanceOf', args: [accounts[ai].wallet] });
        calls.push({ to: r.debtToken, fn: 'balanceOf', args: [accounts[ai].wallet] });
      }));
      const bals = await multicall(provider, calls);
      let k = 0;
      withPos.forEach(ai => reserves.forEach(r => {
        const s = bals[k++], b = bals[k++];
        const sAmt = s ? Number(ethers.formatUnits(s[0], r.decimals)) : 0;
        const bAmt = b ? Number(ethers.formatUnits(b[0], r.decimals)) : 0;
        if (sAmt * r.priceUsd >= 0.01) accounts[ai].positions.push({ side: 'supply', symbol: r.symbol, amount: sAmt, usd: sAmt * r.priceUsd, apy: r.supplyApy, priceUsd: r.priceUsd });
        if (bAmt * r.priceUsd >= 0.01) accounts[ai].positions.push({ side: 'borrow', symbol: r.symbol, amount: bAmt, usd: bAmt * r.priceUsd, apy: r.borrowApy, priceUsd: r.priceUsd });
      }));
      accounts.forEach(a => {
        a.positions.sort((x, y) => (x.side === y.side ? y.usd - x.usd : x.side === 'supply' ? -1 : 1));
        // LT efetivo que reproduz o HF reportado (cobre E-Mode e ativos fora do colateral)
        const cp = a.positions.filter(p => p.side === 'supply').reduce((t, p) => t + p.usd, 0);
        const dp = a.positions.filter(p => p.side === 'borrow').reduce((t, p) => t + p.usd, 0);
        a.ltEff = isFinite(a.hf) && cp > 0 && dp > 0 ? a.hf * dp / cp : a.lt;
      });
    }
    return { chain: key, reserves, accounts };
    } finally { provider.destroy(); }
  }

  return { fetchChain };
}

// ---------- Cálculos (sem rede) ----------

// APY efetivo: soma rendimento de staking embutido no preço (wstETH etc.)
export function effApy(p, nativeYield = {}) {
  return p.apy + (nativeYield[p.symbol] || 0);
}

// Rendimento líquido em US$/ano de uma conta
export function netYieldUsd(acc, nativeYield) {
  return acc.positions.reduce((s, p) => s + (p.side === 'supply' ? 1 : -1) * p.usd * effApy(p, nativeYield) / 100, 0);
}

// HF simulado com queda (fração 0–1) aplicada aos símbolos de `shockSyms`
export function simulateHf(acc, shockSyms, drop) {
  let coll = 0, debt = 0;
  for (const p of acc.positions) {
    const f = shockSyms.includes(p.symbol) ? 1 - drop : 1;
    if (p.side === 'supply') coll += p.usd * f; else debt += p.usd * f;
  }
  if (debt <= 0) return Infinity;
  return coll * (acc.ltEff || acc.lt) / debt;
}

// Queda (0–1) dos `syms` que leva HF a 1. null = queda não liquida.
export function dropToLiquidation(acc, syms) {
  let Cg = 0, Co = 0, Dg = 0, Do = 0;
  for (const p of acc.positions) {
    const inG = syms.includes(p.symbol);
    if (p.side === 'supply') inG ? (Cg += p.usd) : (Co += p.usd);
    else inG ? (Dg += p.usd) : (Do += p.usd);
  }
  const lt = acc.ltEff || acc.lt;
  const den = lt * Cg - Dg;
  if (den <= 0) return null;
  const x = (Do - lt * Co) / den; // fator de preço restante (1 - queda)
  if (x <= 0) return null;
  return Math.min(1, Math.max(0, 1 - x));
}

// Risco principal de liquidação por preço da conta
export function liquidationInfo(acc) {
  const supplies = acc.positions.filter(p => p.side === 'supply');
  if (!supplies.length || acc.debtUsd < 0.01) return null;
  const byGroup = {};
  supplies.forEach(p => { const g = groupOf(p.symbol); byGroup[g] = (byGroup[g] || 0) + p.usd; });
  const top = Object.entries(byGroup).filter(([g]) => g !== 'USD').sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const g = top[0];
  const syms = GROUPS[g] || [g];
  const main = supplies.filter(p => syms.includes(p.symbol)).sort((a, b) => b.usd - a.usd)[0];
  const d = dropToLiquidation(acc, syms);
  if (d !== null) return { kind: 'price', group: g, symbol: main.symbol, drop: d, price: main.priceUsd * (1 - d) };
  // Correlacionado (loop): checa descolamento do colateral principal
  const dd = dropToLiquidation(acc, [main.symbol]);
  return { kind: 'depeg', group: g, symbol: main.symbol, drop: dd };
}

// Loops que deixaram de compensar: por grupo com supply e borrow
export function loopChecks(acc, nativeYield) {
  const out = [];
  const groups = {};
  acc.positions.forEach(p => {
    const g = groupOf(p.symbol);
    groups[g] = groups[g] || { s: 0, sw: 0, b: 0, bw: 0 };
    const a = effApy(p, nativeYield);
    if (p.side === 'supply') { groups[g].s += p.usd; groups[g].sw += p.usd * a; }
    else { groups[g].b += p.usd; groups[g].bw += p.usd * a; }
  });
  for (const [g, v] of Object.entries(groups)) {
    if (v.s > 0 && v.b > 0) {
      const sApy = v.sw / v.s, bApy = v.bw / v.b;
      out.push({ group: g, supplyApy: sApy, borrowApy: bApy, spread: sApy - bApy });
    }
  }
  return out;
}

// Mesmo ativo com taxa melhor em outra rede
export function betterRates(acc, allReserves, minDiff, enabled = {}) {
  const out = [];
  const seen = new Set();
  for (const p of acc.positions) {
    const key = `${p.symbol}:${p.side}`;
    if (seen.has(key) || enabled[key] === false) continue;
    seen.add(key);
    let best = null;
    for (const r of allReserves) {
      if (r.chain === acc.chain || r.symbol !== p.symbol || !r.active || r.frozen || r.paused) continue;
      if (p.side === 'supply') {
        const diff = r.supplyApy - p.apy;
        if (diff >= minDiff && (!best || diff > best.diff)) best = { chain: r.chain, apy: r.supplyApy, diff };
      } else {
        if (!r.borrowing) continue;
        const diff = p.apy - r.borrowApy;
        if (diff >= minDiff && (!best || diff > best.diff)) best = { chain: r.chain, apy: r.borrowApy, diff };
      }
    }
    if (best) out.push({ symbol: p.symbol, side: p.side, ...best });
  }
  return out;
}
