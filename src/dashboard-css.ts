export const DASHBOARD_CSS = `
:root {
  --ink:#28231f; --muted:#6d665e; --paper:#fffdf8; --canvas:#f1ede5;
  --rule:#d9d0c4; --rust:#9f4d2e; --teal:#1f6f78; --gold:#b57920;
  --paper-2:#f7f1e8; --line:var(--rule); --panel:var(--paper);
  --good:var(--teal); --warn:var(--gold); --bad:var(--rust); --disabled:#8c857d;
  --shadow:0 14px 34px rgba(65,49,35,.10);
  --serif:Georgia, "Times New Roman", serif;
  --mono:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --sans:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
*{box-sizing:border-box}html{background:var(--canvas)}
body{margin:0;background:var(--canvas);color:var(--ink);font-family:var(--serif);font-size:15px;line-height:1.5}
.wrap{width:min(100% - 24px,1120px);margin:0 auto;padding:12px 0 24px}
.top{position:relative;display:flex;gap:24px;align-items:flex-start;justify-content:space-between;margin-bottom:16px;background:var(--ink);box-shadow:var(--shadow);color:var(--paper);padding:24px}
.top::after{content:"";position:absolute;inset:8px;border:1px solid rgba(255,253,248,.28);pointer-events:none}
.top>*{position:relative;z-index:1}
.eyebrow{display:inline-block;font:800 11px/1 var(--sans);letter-spacing:.15em;color:#e5b45b;text-transform:uppercase;text-decoration:none}
.brand h1{font-size:16px;line-height:.98;margin:12px 0 0;letter-spacing:-.04em;white-space:nowrap}
.brand-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.brand-row .lang-switch{margin-top:0}
.lang-switch{display:inline-flex;gap:4px;align-items:center;margin-top:12px}
.lang-btn{min-height:32px;min-width:36px;padding:4px 8px;background:transparent;color:var(--paper);border:1px solid rgba(255,253,248,.35);filter:grayscale(1);opacity:.65}
.lang-btn.active{filter:none;opacity:1;border-color:var(--gold);box-shadow:inset 0 -2px var(--gold)}
.status{min-width:104px;text-align:right;font-family:var(--sans);font-size:11px;color:#e6ddd1}
.pill{display:inline-flex;align-items:center;gap:8px;border-left:2px solid var(--rust);padding:4px 0 4px 8px;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:var(--disabled)}
.dot.on{background:#64a9a2}.dot.off{background:#d07b59}
.grid{display:grid;grid-template-columns:1fr;gap:16px}
.card{background:var(--panel);border-top:3px solid var(--ink);box-shadow:var(--shadow);padding:clamp(16px,3vw,24px)}
.card h2{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:clamp(20px,2.4vw,28px);letter-spacing:-.025em;margin:0 0 16px;border-bottom:1px solid var(--line);padding-bottom:8px}
.sub{color:var(--muted);font:600 11px/1.3 var(--sans);letter-spacing:.04em;text-align:right}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.field{display:grid;gap:4px;text-align:left}
.field>span,.field label{font:800 10px/1 var(--sans);letter-spacing:.09em;color:var(--muted);text-transform:uppercase}
.bind-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(92px,1fr);gap:8px;align-items:end}
.bridge-key{margin:12px 0 0}
.bridge-key-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center}
.bridge-key-prefix{min-height:42px;display:inline-flex;align-items:center;border:1px solid var(--line);border-right:0;background:var(--paper-2);padding:0 12px;font-family:var(--mono);font-weight:700}
.bridge-key-row input{min-width:0;border-left:0}
.bridge-key-help-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;margin-top:8px}
.bridge-key-help{font:700 11px/1.2 var(--sans);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bridge-key-help-row button{min-height:36px;min-width:38px;padding:4px 8px}
.one-line-field{display:flex;gap:8px;align-items:center;margin-top:12px}
.one-line-field label{font-weight:700;white-space:nowrap}
.one-line-field input{width:74px;text-align:right}
.concurrency-row{display:grid;grid-template-columns:auto 74px auto 1fr;gap:8px;align-items:center}
[hidden]{display:none!important}
input,select,button{font:inherit}
input,select{width:100%;min-height:42px;border:1px solid var(--line);border-radius:0;background:var(--paper);color:var(--ink);padding:8px 12px}
button{min-height:40px;border:1px solid var(--ink);border-radius:0;background:var(--ink);color:var(--paper);padding:8px 12px;text-transform:uppercase;letter-spacing:.06em;font:800 11px/1.2 var(--sans);cursor:pointer}
button.secondary{background:transparent;color:var(--ink);border-color:var(--line)}
input:focus-visible,select:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.seg{display:grid;grid-template-columns:1fr;gap:8px}
.policy{position:relative;border:1px solid var(--line);border-left:3px solid transparent;padding:12px;background:var(--paper);display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;text-align:left}
.policy:has(input:checked){border-left-color:var(--teal);background:#f2f7f6}
.policy input{width:auto;min-height:0;accent-color:var(--teal)}
.policy b{display:block;font-size:15px}
.info{position:relative;font-size:16px;line-height:1;cursor:help;color:var(--teal);display:inline-flex}
.info .tip{display:none;position:absolute;right:0;top:24px;z-index:5;width:min(72vw,320px);border:1px solid var(--line);background:var(--paper);color:var(--ink);box-shadow:var(--shadow);padding:12px;font:12px/1.45 var(--sans)}
.info:hover .tip,.info:focus .tip,.info.open .tip{display:block}
.info .tip .token{color:var(--muted)}
.card-title{display:inline-flex;align-items:center;gap:8px;position:relative}
.heading-info{min-height:22px;min-width:22px;height:22px;width:22px;padding:0;border:1px solid var(--teal);background:var(--paper);color:var(--teal);font:800 12px/1 var(--sans);text-transform:none;letter-spacing:0;display:inline-grid;place-items:center}
.heading-info .tip{left:0;right:auto;top:calc(100% + 8px);width:min(92vw,440px);white-space:pre-line;text-align:left}
.heading-info:not(.open):not(:focus-visible) .tip{display:none}
.routing-guidance{margin:0 0 8px;border-top:1px solid var(--gold);border-left:3px solid var(--rust);background:var(--paper);color:var(--teal);padding:8px 12px;font:700 12px/1.45 var(--sans);text-align:left;word-break:keep-all}
.kv{display:grid;grid-template-columns:1fr auto;gap:4px;font-family:var(--sans);font-size:12px;border-bottom:1px solid var(--line);padding:4px 0}
.stack{display:grid;gap:8px}
.creds{grid-template-columns:1fr}
.model{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:var(--paper);padding:12px}
.model small{margin-left:4px}
.switch{position:relative;width:48px;height:26px;flex:0 0 auto}
.switch input{position:absolute;inset:0;width:100%;height:100%;min-height:0;margin:0;opacity:0;cursor:pointer}
.slider{position:absolute;inset:0;border:1px solid var(--line);background:var(--paper-2);pointer-events:none}
.slider:before{content:"";position:absolute;width:18px;height:18px;left:4px;top:4px;background:var(--muted)}
.switch input:checked + .slider{background:#e8f3f2;border-color:var(--teal)}
.switch input:checked + .slider:before{transform:translateX(22px);background:var(--teal)}
.credential-fold,.provider-fold{border:1px solid var(--line);background:var(--paper)}
.credential-fold summary,.provider-fold summary{display:flex;align-items:center;gap:8px;padding:12px;cursor:pointer;list-style:none}
.credential-fold summary::-webkit-details-marker,.provider-fold summary::-webkit-details-marker{display:none}
.credential-fold summary::before,.provider-fold summary::before{content:"+";display:inline-grid;place-items:center;width:22px;height:22px;border:1px solid var(--rust);color:var(--rust);font:800 16px/1 var(--sans)}
.credential-fold[open] summary::before,.provider-fold[open] summary::before{content:"−"}
.credential-summary-status,.provider-count{margin-left:auto;color:var(--teal);font:700 11px/1.2 var(--sans)}
.credential-body,.provider-models{display:grid;gap:8px;padding:12px}
.credential-editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.credential-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}
.enabled-row{display:flex;align-items:center;gap:8px;margin:0}
.danger{background:transparent;border-color:var(--rust);color:var(--rust)}
.danger:hover{background:var(--rust);color:var(--paper)}
.small{font:12px/1.45 var(--sans);color:var(--muted);overflow-wrap:anywhere}
.footerbar{margin:0 0 16px;background:var(--ink);padding:12px;display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center}
.footerbar #save{background:var(--paper);color:var(--ink);border-color:var(--paper)}
.footerbar #save:hover{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.footerbar #restart{background:transparent;color:var(--paper);border-color:rgba(255,253,248,.45)}
.footerbar #restart.active,.footerbar #restart:hover{background:var(--gold);color:#000;border-color:var(--gold)}
.token{font-family:var(--mono);font-size:11px;color:var(--paper)}
.toast{position:fixed;left:12px;right:12px;top:12px;background:var(--ink);color:var(--paper);border-left:4px solid var(--gold);padding:12px;transform:translateY(-140%);transition:transform .2s;z-index:20}
.toast.show{transform:translateY(0)}
.add-row{display:grid;grid-template-columns:1fr auto;gap:8px}
@media(max-width:520px){.footerbar{grid-template-columns:1fr 1fr}.footerbar .token{grid-column:1/-1}.add-row,.credential-editor{grid-template-columns:1fr}.bridge-key-help{display:none}.bridge-key-help-row{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.brand h1{white-space:normal}.bind-grid{grid-template-columns:1fr}.bridge-key-help-row{grid-template-columns:repeat(3,minmax(0,1fr))}.lang-btn{min-width:44px;min-height:44px}.heading-info{width:32px;height:32px}.switch{height:44px}.switch .slider{top:8px;bottom:8px}.routing-guidance{overflow-wrap:normal}}
@media(min-width:760px){.wrap{padding:24px 0 32px}.grid{grid-template-columns:1fr 1fr}.wide{grid-column:1/-1}.brand h1{font-size:clamp(30px,4vw,48px)}.top{align-items:center;padding:32px}.provider-models{grid-template-columns:repeat(2,minmax(0,1fr))}.creds{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}
`.trim();
