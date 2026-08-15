import { DASHBOARD_CSS } from "./dashboard-css.js";
import { translations } from "./dashboard-i18n.js";
import { BRIDGE_VERSION } from "./version.js";

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function dashboardHtml(initialConfig: unknown = null): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Freebuff Bridge 콘솔</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <main class="wrap">
    <header class="top">
      <div class="brand">
        <a class="eyebrow" href="https://github.com/yelixir-dev" target="_blank" rel="noopener noreferrer">github.com/yelixir-dev</a>
        <div class="brand-row">
          <h1 data-i18n="appTitle">Freebuff Bridge 콘솔</h1>
          <div class="lang-switch" role="group" aria-label="Language">
            <button class="lang-btn" type="button" data-lang="ko" aria-label="한국어">🇰🇷</button>
            <button class="lang-btn" type="button" data-lang="en" aria-label="English">🇺🇸</button>
            <button class="lang-btn" type="button" data-lang="zh" aria-label="中文">🇨🇳</button>
          </div>
        </div>
      </div>
      <div class="status">
        <span class="pill"><i id="dot" class="dot"></i><span id="online" data-state="checking">확인 중</span></span>
        <div id="bridgeVersion" class="small">v${BRIDGE_VERSION}</div>
      </div>
    </header>
    <div class="footerbar">
      <span id="dirtyText" class="token">대기 중인 변경 없음</span>
      <button id="save" type="button" data-i18n="saveJson">JSON 저장</button>
      <button id="restart" type="button" disabled data-i18n="restartBridge">Bridge 재시작</button>
    </div>
    <section class="grid">
      <section class="card">
        <h2><span data-i18n="serverBind">서버 바인드</span> <span class="sub" data-i18n="afterRestart">재시작 후 적용</span></h2>
        <div class="bind-grid">
          <div class="field"><label data-i18n="bindHost">바인드 호스트</label>
            <select id="bindHost">
              <option value="127.0.0.1" data-i18n="localBindOption">127.0.0.1 · 로컬 전용</option>
              <option value="0.0.0.0">0.0.0.0 · LAN/Tailscale</option>
            </select>
          </div>
          <div class="field"><label data-i18n="port">포트</label><input id="bindPort" type="number" min="1" max="65535" /></div>
        </div>
        <div class="field bridge-key"><label data-i18n="clientApiKey">클라이언트 API Key</label>
          <div class="bridge-key-row"><span class="bridge-key-prefix">sk-</span><input id="bridgeApiKey" type="text" autocomplete="off" spellcheck="false" data-i18n-placeholder="bridgeKeyPlaceholder" placeholder="fbbr-랜덤48 · 복사/수정 가능" /></div>
          <div class="bridge-key-help-row">
            <span class="bridge-key-help" data-i18n="bridgeKeyHelp">외부 /v1 호출용 key</span>
            <button id="genKey" class="secondary" type="button" data-i18n-aria="generateClientApiKey" aria-label="클라이언트 API Key 생성">🎲</button>
            <button id="copyKey" class="secondary" type="button" data-i18n-aria="copyClientApiKey" aria-label="클라이언트 API Key 복사">⧉</button>
            <button id="saveKey" class="secondary" type="button" data-i18n-aria="saveClientApiKey" aria-label="클라이언트 API Key 저장">💾</button>
          </div>
        </div>
      </section>
      <section class="card">
        <h2><span data-i18n="routingPolicy">라우팅 정책</span> <span class="sub" data-i18n="defaultThinLong">기본값: 가늘고 길게</span></h2>
        <p class="routing-guidance" data-i18n="quotaNote"></p>
        <div id="policies" class="seg"></div>
        <div id="thickRow" class="one-line-field concurrency-row" hidden>
          <label for="maxConcurrent" data-i18n="maxConcurrent">최대 동시호출</label>
          <input id="maxConcurrent" type="number" min="1" />
          <span data-i18n="timesUnit">회</span>
        </div>
      </section>
      <section class="card wide">
        <h2><span data-i18n="credentials">자격 증명</span> <span class="row"><button id="refreshCreds" class="secondary" type="button" data-i18n="refresh">새로고침</button></span></h2>
        <div class="add-row">
          <input id="newToken" type="password" autocomplete="off" data-i18n-placeholder="pasteToken" placeholder="authToken 붙여넣기" />
          <button id="addCred" class="secondary" type="button" data-i18n="addKey">키 추가</button>
        </div>
        <div id="creds" class="stack creds"></div>
      </section>
      <section class="card wide">
        <h2><span data-i18n="models">모델</span> <span class="row">
          <button id="enableAllModels" class="secondary" type="button" data-i18n="enableAllModels">모두 켜기</button>
          <button id="disableAllModels" class="secondary" type="button" data-i18n="disableAllModels">모두 끄기</button>
          <button id="enablePremium" class="secondary" type="button" data-i18n="enablePremium">premium 켜기</button>
          <button id="disablePremium" class="secondary" type="button" data-i18n="disablePremium">premium 끄기</button>
        </span></h2>
        <div id="models" class="stack"></div>
      </section>
    </section>
  </main>
  <div id="toast" class="toast"></div>
  <script>
    const translations=${scriptJson(translations)};
    const initialConfig=${scriptJson(initialConfig)};
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[ch]));
    let stored = localStorage.getItem("dashboardLang") || "";
    let activeLang = stored.startsWith("en") ? "en" : stored.startsWith("zh") ? "zh" : "ko";
    let cfg = initialConfig, dirty = false;
    const tr = (key) => translations[activeLang]?.[key] ?? translations.ko[key] ?? key;
    function markDirty(value) {
      dirty = value;
      $("restart").disabled = !dirty;
      $("restart").classList.toggle("active", dirty);
      $("dirtyText").textContent = dirty ? tr("dirty") : tr("clean");
    }
    function applyLang() {
      document.title = tr("appTitle");
      document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = tr(el.dataset.i18n); });
      document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = tr(el.dataset.i18nPlaceholder); });
      document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", tr(el.dataset.i18nAria)); });
      document.querySelectorAll("[data-lang]").forEach((btn) => btn.classList.toggle("active", btn.dataset.lang === activeLang));
      markDirty(dirty);
      if (cfg) render();
    }
    document.querySelectorAll("[data-lang]").forEach((btn) => {
      btn.onclick = () => { activeLang = btn.dataset.lang; localStorage.setItem("dashboardLang", activeLang); applyLang(); };
    });
    function toast(text) { const el = $("toast"); el.textContent = text; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2200); }
    async function api(path, opt = {}) {
      const headers = { "content-type": "application/json" };
      const key = fullBridgeKey();
      if (key) headers.authorization = "Bearer " + key;
      const res = await fetch(path, { cache: "no-store", headers, ...opt });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    function remainText(c) {
      if (typeof c.remaining === "number" && c.quota) return c.remaining + " / " + c.quota.limit;
      if (c.quota) return Math.max(0, c.quota.limit - c.quota.recentCount) + " / " + c.quota.limit;
      return "—";
    }
    function render() {
      if (!cfg) return;
      $("bindHost").value = cfg.server.host;
      $("bindPort").value = cfg.server.port;
      if (typeof syncBridgeKey === 'function') syncBridgeKey();
      $("thickRow").hidden = cfg.routing.policy !== "short_thick";
      if (document.activeElement !== $("maxConcurrent")) $("maxConcurrent").value = cfg.routing.maxConcurrent || cfg.routing.accountCount || 1;
      $("policies").innerHTML = Object.entries(tr("policies")).map(([id, pair]) =>
        '<label class="policy"><input type="radio" name="policy" value="'+esc(id)+'" '+(cfg.routing.policy===id?'checked':'')+'><b>'+esc(pair[0])+'</b><span class="info" tabindex="0">ℹ️<span class="tip">'+esc(pair[1])+'<br><span class="token">'+esc(id)+'</span></span></span></label>'
      ).join('');
      document.querySelectorAll("input[name=policy]").forEach((el) => el.onchange = () => { cfg.routing.policy = el.value; markDirty(true); applyLang(); });
      $("creds").innerHTML = (cfg.credentials || []).map((c) =>
        '<details class="credential-fold"><summary><span>'+esc(c.label || c.id)+'</span><span class="credential-summary-status">'+esc(remainText(c))+'</span></summary><div class="credential-body">'+
        '<div class="kv"><span>'+esc(tr("status"))+"</span><b>"+esc(c.status || "none")+"</b></div>"+
        '<div class="kv"><span>'+esc(tr("tier"))+"</span><b>"+esc(c.accessTier || "unknown")+"</b></div>"+
        '<div class="kv"><span>'+esc(tr("sessions"))+"</span><b>"+esc(remainText(c))+"</b></div>"+
        '<div class="kv"><span>'+esc(tr("reset"))+"</span><b>"+esc(c.quota?.resetAt || "—")+"</b></div>"+
        '<div class="small">'+esc(c.tokenPreview || "")+"</div></div></details>"
      ).join("");
      const groups = new Map();
      (cfg.models || []).forEach((m, i) => { const p = m.provider || "other"; if (!groups.has(p)) groups.set(p, []); groups.get(p).push({ m, i }); });
      $("models").innerHTML = [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([provider, rows]) => {
        const enabled = rows.filter((r) => r.m.enabled).length;
        return '<details class="provider-fold" data-provider="'+esc(provider)+'" data-enabled="'+enabled+'" data-total="'+rows.length+'"><summary><span>'+esc(provider)+'</span> <span class="provider-count">('+enabled+'/'+rows.length+')</span></summary><div class="provider-models">'+
          rows.map(({m,i}) => '<div class="model"><div><b>'+esc(m.label || m.id)+'</b><div class="small">'+esc(m.id)+(m.premium?' · premium':'')+(m.limitedOk?' · limited-ok':'')+'</div></div><label class="switch"><input data-mid="'+i+'" type="checkbox" '+(m.enabled?'checked':'')+'><span class="slider"></span></label></div>').join('')+
          '</div></details>';
      }).join("");
      document.querySelectorAll("[data-mid]").forEach((el) => el.onchange = () => { cfg.models[+el.dataset.mid].enabled = el.checked; markDirty(true); applyLang(); });
    }
    function setModels(pred, on) { (cfg.models || []).forEach((m) => { if (pred(m)) m.enabled = on; }); markDirty(true); applyLang(); }
    $("bindHost").onchange = () => { cfg.server.host = $("bindHost").value; markDirty(true); applyLang(); };
    $("bindPort").oninput = () => { cfg.server.port = Number($("bindPort").value) || 9993; markDirty(true); applyLang(); };
    $("maxConcurrent").oninput = () => { cfg.routing.maxConcurrent = Number($("maxConcurrent").value) || 1; markDirty(true); applyLang(); };
    $("enableAllModels").onclick = () => setModels(() => true, true);
    $("disableAllModels").onclick = () => setModels(() => true, false);
    $("enablePremium").onclick = () => setModels((m) => m.premium, true);
    $("disablePremium").onclick = () => setModels((m) => m.premium, false);
    function isRedacted(value) { const v = String(value || '').trim(); return !v || v === '[REDACTED]' || v === 'sk-[REDACTED]' || v.includes('…'); }
    function displayBridgeKey(key) { if (isRedacted(key)) return ''; return String(key).startsWith('sk-') ? String(key).slice(3) : String(key || ''); }
    function fullBridgeKey() { const raw = ($('bridgeApiKey').value || '').trim(); if (!raw || isRedacted(raw)) return ''; return raw.startsWith('sk-') ? raw : 'sk-' + raw; }
    function syncBridgeKey() { const el = $('bridgeApiKey'); if (document.activeElement !== el) el.value = displayBridgeKey(cfg?.bridgeApiKey); }
    function randomBridgeKey() {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      return 'sk-fbbr-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    $("genKey").onclick = () => { const key = randomBridgeKey(); cfg.bridgeApiKey = key; $('bridgeApiKey').value = displayBridgeKey(key); markDirty(true); toast(tr('generateClientApiKey')); };
    $("copyKey").onclick = async () => {
      const key = fullBridgeKey();
      if (!key) { toast(tr('clientKeyEmpty')); return; }
      await navigator.clipboard.writeText(key);
      toast(tr('copyClientApiKey'));
    };
    $("saveKey").onclick = () => { cfg.bridgeApiKey = fullBridgeKey(); markDirty(true); toast(tr('saveClientApiKey')); };
    $("save").onclick = async () => {
      const pendingKey = fullBridgeKey();
      cfg = await api("/admin/config", { method: "PUT", body: JSON.stringify({ server: cfg.server, routing: cfg.routing, models: cfg.models, ...(pendingKey ? { bridgeApiKey: pendingKey } : {}) }) });
      markDirty(true); applyLang(); toast(tr("saveJson"));
    };
    $("restart").onclick = async () => { await api("/admin/restart", { method: "POST", body: "{}" }); toast(tr("restartBridge")); };
    $("refreshCreds").onclick = async () => {
      const snap = await api("/admin/freebuff/credentials?refresh=true");
      cfg.credentials = snap.credentials; render(); toast(tr("refresh"));
    };
    $("addCred").onclick = async () => {
      const token = $("newToken").value.trim();
      if (!token) return;
      const snap = await api("/admin/freebuff/credentials", { method: "POST", body: JSON.stringify({ authToken: token }) });
      cfg.credentials = snap.credentials; $("newToken").value = ""; markDirty(true); applyLang(); toast(tr("addKey"));
    };
    applyLang();
    (async () => {
      try {
        const health = await api("/health");
        $("dot").className = "dot on"; $("online").dataset.state = "online"; $("online").textContent = tr("online");
        $("bridgeVersion").textContent = "v" + (health.version || "${BRIDGE_VERSION}");
        cfg = await api("/admin/config");
        applyLang();
        const snap = await api("/admin/freebuff/credentials?refresh=true");
        cfg.credentials = snap.credentials;
        applyLang();
      } catch { $("dot").className = "dot off"; $("online").dataset.state = "offline"; $("online").textContent = tr("offline"); applyLang(); }
    })();
  </script>
</body></html>`;
}
