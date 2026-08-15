import { dashboardClientScript } from "./dashboard-client.js";
import { DASHBOARD_CSS } from "./dashboard-css.js";
import { BRIDGE_VERSION } from "./version.js";

export function dashboardHtml(): string {
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
          <h1>FREEBUFF<br />BRIDGE</h1>
          <div class="lang-switch" aria-label="Language">
            <button class="lang-btn" type="button" data-lang="ko" aria-label="한국어">🇰🇷</button>
            <button class="lang-btn" type="button" data-lang="en" aria-label="English">🇺🇸</button>
            <button class="lang-btn" type="button" data-lang="zh" aria-label="中文">🇨🇳</button>
          </div>
        </div>
        <p data-i18n="appTitle">Freebuff Bridge 콘솔</p>
      </div>
      <div class="status">
        <span class="pill">
          <span id="dot" class="dot wait"></span>
          <span id="online" data-state="checking" data-i18n="checking">확인 중</span>
          <span class="version">v${BRIDGE_VERSION}</span>
        </span>
      </div>
    </header>

    <div class="footerbar">
      <span id="dirtyText" class="token" data-i18n="clean">저장됨</span>
      <button id="save" type="button" data-i18n="saveJson">JSON 저장</button>
      <button id="restart" type="button" data-i18n="restartBridge" disabled>브릿지 재시작</button>
    </div>

    <section class="grid">
      <section class="card">
        <h2 data-i18n="serverBind">서버 바인딩</h2>
        <div class="bind-grid">
          <label class="field"><span data-i18n="bindHost">호스트</span>
            <select id="bindHost">
              <option value="127.0.0.1" data-i18n="localBindOption">127.0.0.1 · 로컬</option>
              <option value="0.0.0.0">0.0.0.0 · LAN</option>
            </select>
          </label>
          <label class="field"><span data-i18n="port">포트</span><input id="bindPort" type="number" min="1" max="65535" /></label>
        </div>
        <p class="small" data-i18n="afterRestart">재시작 후 적용됩니다.</p>
      </section>

      <section class="card">
        <h2 data-i18n="clientApiKey">클라이언트 API 키</h2>
        <div class="bridge-key-row">
          <span class="bridge-key-prefix">sk-</span>
          <input id="bridgeApiKey" type="password" autocomplete="off" data-i18n-placeholder="bridgeKeyPlaceholder" />
        </div>
        <div class="bridge-key-help-row">
          <span class="bridge-key-help" data-i18n="bridgeKeyHelp"></span>
          <button id="genKey" class="secondary" type="button" data-i18n-aria="generateClientApiKey" aria-label="클라이언트 API 키 생성">🎲</button>
          <button id="copyKey" class="secondary" type="button" data-i18n-aria="copyClientApiKey" aria-label="클라이언트 API 키 복사">📋</button>
          <button id="saveKey" class="secondary" type="button" data-i18n-aria="saveClientApiKey" aria-label="클라이언트 API 키 저장">💾</button>
        </div>
      </section>

      <section class="card">
        <h2 data-i18n="routingPolicy">라우팅 정책</h2>
        <div id="routingPolicy" class="seg">
          <label class="policy"><input type="radio" name="routingPolicy" value="thin_long" /><span data-i18n="thin_long">가늘고 길게</span></label>
          <label class="policy"><input type="radio" name="routingPolicy" value="short_thick" /><span data-i18n="short_thick">짧고 굵게</span></label>
        </div>
        <p id="routingGuidance" class="routing-guidance"></p>
        <label id="shortOptions" class="one-line-field field"><span data-i18n="maxConcurrent">최대 동시 호출</span><input id="maxConcurrent" type="number" min="1" /></label>
      </section>

      <section class="card wide">
        <h2>
          <span class="card-title">
            <span data-i18n="credentials">자격 증명</span>
            <button id="credHelp" class="info heading-info" type="button" aria-expanded="false" data-i18n-aria="credHelpAria">i<span class="tip" data-i18n="credHelp"></span></button>
          </span>
          <span class="row">
            <button id="refreshCreds" class="secondary" type="button" data-i18n="refresh">새로고침</button>
            <button id="addCred" type="button" data-i18n="addKey">키 추가</button>
          </span>
        </h2>
        <div id="creds" class="stack creds"></div>
      </section>

      <section class="card wide">
        <h2>
          <span data-i18n="models">모델</span>
          <span class="row">
            <button id="enableAllModels" class="secondary" type="button" data-i18n="enableAllModels">모두 켜기</button>
            <button id="disableAllModels" class="secondary" type="button" data-i18n="disableAllModels">모두 끄기</button>
            <button id="enablePremium" class="secondary" type="button" data-i18n="enablePremium">premium 켜기</button>
            <button id="disablePremium" class="secondary" type="button" data-i18n="disablePremium">premium 끄기</button>
          </span>
        </h2>
        <div id="models" class="stack"></div>
      </section>
    </section>
  </main>
  <div id="toast" class="toast"></div>
  <script>${dashboardClientScript()}</script>
</body>
</html>`;
}
