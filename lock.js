// Bloqueio por PIN + Face ID (passkey).
// É uma trava de acesso no aparelho; o código e o config.json do repo público continuam visíveis no GitHub.
(function () {
  const LS = window.localStorage, SS = window.sessionStorage;
  const K = { hash: 'aave.pin.hash', salt: 'aave.pin.salt', cred: 'aave.faceid.cred', fails: 'aave.pin.fails', until: 'aave.pin.until', ok: 'aave.unlocked', hidden: 'aave.hiddenAt' };
  const RELOCK_MS = 5 * 60 * 1000;
  const lang = (LS.getItem('aave.lang') || 'pt');
  const T = {
    pt: { enter: 'Digite seu PIN', create: 'Crie um PIN (4 a 6 dígitos)', confirm: 'Confirme o PIN', mismatch: 'Os PINs não batem. Tente de novo.', wrong: 'PIN incorreto', wait: 'Muitas tentativas. Aguarde {s}s.', faceid: 'Usar Face ID', forgot: 'Esqueci o PIN', forgotQ: 'Isso apaga o PIN, o Face ID e o token do GitHub salvos neste aparelho. Continuar?', ok: 'OK', setupFace: 'Ativar Face ID para abrir mais rápido?', yes: 'Ativar', no: 'Agora não' },
    en: { enter: 'Enter your PIN', create: 'Create a PIN (4 to 6 digits)', confirm: 'Confirm your PIN', mismatch: "PINs don't match. Try again.", wrong: 'Wrong PIN', wait: 'Too many attempts. Wait {s}s.', faceid: 'Use Face ID', forgot: 'Forgot PIN', forgotQ: 'This clears the PIN, Face ID and GitHub token saved on this device. Continue?', ok: 'OK', setupFace: 'Turn on Face ID for faster access?', yes: 'Turn on', no: 'Not now' },
  }[lang === 'en' ? 'en' : 'pt'];

  const theme = LS.getItem('aave.theme') || 'auto';
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const C = dark ? { bg: '#111214', card: '#1c1d20', text: '#f2f2f3', mute: '#9a9ba1', line: '#2c2d31', red: '#ff6b6b' } : { bg: '#f5f5f7', card: '#ffffff', text: '#18181b', mute: '#6b6b73', line: '#e3e3e7', red: '#d32f2f' };

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function hashPin(pin, saltB64) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bitsBuf = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256);
    return b64(bitsBuf);
  }

  function isUnlocked() {
    if (SS.getItem(K.ok) !== '1') return false;
    const h = Number(SS.getItem(K.hidden) || 0);
    if (h && Date.now() - h > RELOCK_MS) { SS.removeItem(K.ok); return false; }
    return true;
  }

  // Esconde a página antes de pintar
  const hideStyle = document.createElement('style');
  hideStyle.textContent = 'html.dash-locked body>*:not(#dash-lock){visibility:hidden!important}';
  document.head.appendChild(hideStyle);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) SS.setItem(K.hidden, String(Date.now()));
    else { if (!isUnlocked()) lock(); SS.removeItem(K.hidden); }
  });

  window.DashLock = { lock, hasFaceId: () => !!LS.getItem(K.cred), enableFaceId, disableFaceId, changePin: () => { LS.removeItem(K.hash); LS.removeItem(K.salt); lock(); } };

  if (!isUnlocked()) lock();

  function lock() {
    SS.removeItem(K.ok);
    document.documentElement.classList.add('dash-locked');
    const start = () => render(LS.getItem(K.hash) ? 'enter' : 'create');
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  function unlock() {
    SS.setItem(K.ok, '1');
    LS.removeItem(K.fails); LS.removeItem(K.until);
    document.documentElement.classList.remove('dash-locked');
    const el = document.getElementById('dash-lock');
    if (el) el.remove();
    window.dispatchEvent(new Event('dash-unlocked'));
  }

  function render(mode, firstPin) {
    let el = document.getElementById('dash-lock');
    if (!el) { el = document.createElement('div'); el.id = 'dash-lock'; document.body.appendChild(el); }
    el.style.cssText = `position:fixed;inset:0;z-index:99999;background:${C.bg};color:${C.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;-webkit-user-select:none;user-select:none`;
    const title = mode === 'enter' ? T.enter : mode === 'create' ? T.create : T.confirm;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', mode === 'enter' && LS.getItem(K.cred) ? 'face' : '', '0', 'del'];
    el.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${C.mute}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      <div style="font-size:17px;font-weight:600;margin:10px 0 14px;text-align:center">${title}</div>
      <div id="dl-dots" style="display:flex;gap:12px;height:12px;margin-bottom:10px"></div>
      <div id="dl-msg" style="min-height:18px;font-size:13px;color:${C.red};margin-bottom:12px;text-align:center"></div>
      <div style="display:grid;grid-template-columns:repeat(3,68px);gap:14px">
        ${keys.map(k => k === '' ? '<div></div>' : `<button data-k="${k}" style="width:68px;height:68px;border-radius:50%;border:1px solid ${C.line};background:${k === 'face' || k === 'del' ? 'transparent' : C.card};color:${C.text};font-size:24px;font-family:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent" aria-label="${k === 'face' ? T.faceid : k === 'del' ? '⌫' : k}">${k === 'face' ? faceSvg() : k === 'del' ? '⌫' : k}</button>`).join('')}
      </div>
      ${mode === 'enter' ? `<button id="dl-forgot" style="margin-top:22px;background:none;border:none;color:${C.mute};font-size:13px;font-family:inherit;cursor:pointer">${T.forgot}</button>` : ''}`;
    let pin = '';
    const max = 6;
    const dots = el.querySelector('#dl-dots'), msg = el.querySelector('#dl-msg');
    const draw = () => { dots.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span style="width:12px;height:12px;border-radius:50%;${i < pin.length ? `background:${C.text}` : `border:1.5px solid ${C.mute}`}"></span>`).join(''); };
    draw();

    const submit = async () => {
      if (pin.length < 4) return;
      if (mode === 'create') return render('confirm', pin);
      if (mode === 'confirm') {
        if (pin !== firstPin) { render('create'); document.getElementById('dl-msg').textContent = T.mismatch; return; }
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
        LS.setItem(K.salt, salt); LS.setItem(K.hash, await hashPin(pin, salt)); LS.setItem('aave.pin.len', String(pin.length));
        unlock();
        if (window.PublicKeyCredential && !LS.getItem(K.cred) && confirm(T.setupFace)) enableFaceId();
        return;
      }
      const until = Number(LS.getItem(K.until) || 0);
      if (Date.now() < until) { msg.textContent = T.wait.replace('{s}', Math.ceil((until - Date.now()) / 1000)); pin = ''; draw(); return; }
      if (await hashPin(pin, LS.getItem(K.salt)) === LS.getItem(K.hash)) return unlock();
      const fails = Number(LS.getItem(K.fails) || 0) + 1;
      LS.setItem(K.fails, String(fails));
      if (fails >= 5) { LS.setItem(K.until, String(Date.now() + 30000 * (fails - 4))); msg.textContent = T.wait.replace('{s}', 30 * (fails - 4)); }
      else msg.textContent = T.wrong;
      pin = ''; draw();
    };

    el.querySelectorAll('button[data-k]').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.dataset.k;
      msg.textContent = '';
      if (k === 'del') pin = pin.slice(0, -1);
      else if (k === 'face') return faceUnlock();
      else if (pin.length < max) pin += k;
      draw();
      // Confirma automaticamente ao atingir o tamanho do PIN salvo (ou 6)
      if (mode === 'confirm' && pin.length === firstPin.length) submit();
      else if (mode === 'enter' && pin.length === Number(LS.getItem('aave.pin.len') || 4)) submit();
      else if (mode === 'create' && pin.length === max) submit();
    }));
    if (mode === 'create') {
      const ok = document.createElement('button');
      ok.textContent = T.ok;
      ok.style.cssText = `margin-top:18px;padding:10px 28px;border-radius:10px;border:1px solid ${C.line};background:${C.card};color:${C.text};font-size:15px;font-family:inherit`;
      ok.onclick = submit; el.appendChild(ok);
    }
    const forgot = el.querySelector('#dl-forgot');
    if (forgot) forgot.onclick = () => {
      if (!confirm(T.forgotQ)) return;
      [K.hash, K.salt, K.cred, K.fails, K.until, 'aave.pin.len', 'aave.gh.token'].forEach(k => LS.removeItem(k));
      render('create');
    };
    if (mode === 'enter' && LS.getItem(K.cred) && !el._autoFace) { el._autoFace = true; setTimeout(faceUnlock, 300); }
  }

  function faceSvg() {
    return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9v1M15 9v1M12 9v4h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/></svg>`;
  }

  async function enableFaceId() {
    try {
      const cred = await navigator.credentials.create({ publicKey: {
        rp: { name: 'Aave', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'aave', displayName: 'Aave' },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
      } });
      LS.setItem(K.cred, b64(cred.rawId));
      return true;
    } catch (e) { console.warn('Face ID não ativado', e); return false; }
  }
  function disableFaceId() { LS.removeItem(K.cred); }

  async function faceUnlock() {
    try {
      await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(LS.getItem(K.cred)) }],
        userVerification: 'required', timeout: 60000, rpId: location.hostname,
      } });
      unlock();
    } catch (e) { console.warn('Face ID cancelado', e); }
  }
})();
