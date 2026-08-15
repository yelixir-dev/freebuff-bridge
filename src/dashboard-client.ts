import { translations } from "./dashboard-i18n.js";

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function dashboardClientScript(initialConfig: unknown = null): string {
  return `
    const translations=${scriptJson(translations)};
    const initialConfig=${scriptJson(initialConfig)};
    const $=(id)=>document.getElementById(id);
    const esc=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[char]));
    let activeLang=(localStorage.getItem("dashboardLang")||navigator.language||"ko").slice(0,2);
    if(!["ko","en","zh"].includes(activeLang)) activeLang="ko";
    let cfg=initialConfig,dirty=false,adminAuthKey=localStorage.getItem("bridgeApiKey")||"",pendingBridgeKey="";
    const tr=(key)=>translations[activeLang]?.[key]??translations.ko[key]??key;
    const policyPart=(policy,index)=>translations[activeLang]?.policies?.[policy]?.[index]??policy;
    function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2200)}
    function markDirty(value=true){dirty=value;$("restart").disabled=!dirty;$("restart").classList.toggle("active",dirty);$("dirtyText").textContent=tr(dirty?"dirty":"clean")}
    function isRedacted(value){const text=String(value||"").trim();return !text||text==="[REDACTED]"||text==="sk-[REDACTED]"||text.includes("…")}
    function fullBridgeKey(){const raw=($("bridgeApiKey").value||"").trim();if(!raw||isRedacted(raw))return"";return raw.startsWith("sk-")?raw:"sk-"+raw}
    function authHeaders(){const key=adminAuthKey||fullBridgeKey();return key?{authorization:"Bearer "+key}:{}}
    async function fetchJson(path,options={},origin=""){const response=await fetch(origin+path,{cache:"no-store",...options,headers:{"content-type":"application/json",...authHeaders(),...(options.headers||{})}});if(!response.ok)throw new Error(await response.text());return response.json()}
    function remainText(value){return value===null||value===undefined?"—":String(value)}
    function annotateCredentials(){(cfg.credentials||[]).forEach((item)=>{item.originalId??=item.id})}
    function credentialPayloads(){return (cfg.credentials||[]).map((item)=>({id:item.id,originalId:item.isNew?undefined:item.originalId,label:item.label.trim(),...(item.pendingAuthToken?{authToken:item.pendingAuthToken}:{}),enabled:item.enabled!==false}))}
    function renderCredentials(){
      $("creds").innerHTML=(cfg.credentials||[]).map((item,index)=>{
        const summary=item.label||item.id||tr("newCredential");
        const tokenHint=item.authTokenConfigured?(item.authTokenPreview||tr("leaveBlankToKeep")):tr("pasteToken");
        return '<details class="cred credential-fold"><summary><strong>'+esc(summary)+'</strong><span class="credential-summary-status">'+esc(item.status||"none")+'</span></summary><div class="credential-body"><div class="credential-editor"><label class="field"><span>'+esc(tr("credentialName"))+'</span><input class="cred-name" data-cname="'+index+'" value="'+esc(item.label||"")+'" /></label><label class="field"><span>'+esc(tr("authToken"))+'</span><input type="password" data-ctoken="'+index+'" autocomplete="off" placeholder="'+esc(tokenHint)+'" /></label></div><div class="credential-actions"><label class="enabled-row field"><span>'+esc(tr("credentialEnabled"))+'</span><span class="switch"><input type="checkbox" data-cenabled="'+index+'" '+(item.enabled!==false?"checked":"")+' /><i class="slider"></i></span></label><button class="danger" type="button" data-del="'+index+'">'+esc(tr("deleteCredential"))+'</button></div><div class="kv"><span>'+esc(tr("status"))+'</span><strong>'+esc(item.status||"none")+'</strong></div><div class="kv"><span>'+esc(tr("sessions"))+'</span><strong>'+esc(remainText(item.remaining))+'</strong></div><div class="kv"><span>'+esc(tr("tier"))+'</span><strong>'+esc(item.accessTier||"—")+'</strong></div></div></details>'
      }).join("");
      document.querySelectorAll("[data-cname]").forEach((el)=>el.oninput=()=>{const item=cfg.credentials[+el.dataset.cname];item.label=el.value;markDirty()});
      document.querySelectorAll("[data-ctoken]").forEach((el)=>el.oninput=()=>{cfg.credentials[+el.dataset.ctoken].pendingAuthToken=el.value.trim();markDirty()});
      document.querySelectorAll("[data-cenabled]").forEach((el)=>el.onchange=()=>{cfg.credentials[+el.dataset.cenabled].enabled=el.checked;markDirty()});
      document.querySelectorAll("[data-del]").forEach((el)=>el.onclick=()=>{cfg.credentials.splice(+el.dataset.del,1);markDirty();renderCredentials()});
    }
    function renderModels(){
      const providers=[...new Set((cfg.models||[]).map((model)=>model.provider))].sort((a,b)=>a.localeCompare(b));
      $("models").innerHTML=providers.map((provider)=>{const entries=cfg.models.map((model,index)=>({model,index})).filter(({model})=>model.provider===provider);const enabled=entries.filter(({model})=>model.enabled).length;return '<details class="provider-fold"><summary data-provider="'+esc(provider)+'" data-enabled="'+enabled+'" data-total="'+entries.length+'"><strong>'+esc(provider)+'</strong><span class="provider-count">('+enabled+'/'+entries.length+')</span></summary><div class="provider-models">'+entries.map(({model,index})=>'<label class="model"><span><strong>'+esc(model.label)+'</strong><small>'+(model.premium?"premium":"standard")+'</small></span><span class="switch"><input type="checkbox" data-mid="'+index+'" '+(model.enabled?"checked":"")+' /><i class="slider"></i></span></label>').join("")+'</div></details>'}).join("");
      document.querySelectorAll("[data-mid]").forEach((el)=>el.onchange=()=>{cfg.models[+el.dataset.mid].enabled=el.checked;const summary=el.closest(".provider-fold").querySelector("summary");const provider=summary.dataset.provider;const entries=cfg.models.filter((model)=>model.provider===provider);const enabled=entries.filter((model)=>model.enabled).length;summary.dataset.enabled=String(enabled);summary.querySelector(".provider-count").textContent="("+enabled+"/"+entries.length+")";markDirty()});
    }
    function render(){
      $("bindHost").value=cfg.server.host;$("bindPort").value=cfg.server.port;
      document.querySelectorAll('input[name="routingPolicy"]').forEach((el)=>{el.checked=el.value===cfg.routing.policy});
      $("maxConcurrent").value=cfg.routing.maxConcurrent||Math.max(1,cfg.routing.accountCount||1);
      $("shortOptions").hidden=cfg.routing.policy!=="short_thick";
      $("routingGuidance").textContent=policyPart(cfg.routing.policy,1);
      renderCredentials();renderModels();
    }
    function applyLang(){
      document.documentElement.lang=activeLang;document.title=tr("appTitle");
      document.querySelectorAll("[data-i18n]").forEach((el)=>{el.textContent=tr(el.dataset.i18n)});
      document.querySelectorAll("[data-i18n-placeholder]").forEach((el)=>{el.placeholder=tr(el.dataset.i18nPlaceholder)});
      document.querySelectorAll("[data-i18n-aria]").forEach((el)=>{el.setAttribute("aria-label",tr(el.dataset.i18nAria))});
      document.querySelectorAll("[data-lang]").forEach((el)=>el.classList.toggle("active",el.dataset.lang===activeLang));
      document.querySelectorAll('input[name="routingPolicy"]').forEach((el)=>{el.nextElementSibling.textContent=policyPart(el.value,0)});
      const connectionState=$("online").dataset.state;if(connectionState)$("online").textContent=tr(connectionState);
      if(cfg)render();markDirty(dirty);
    }
    async function load(){
      try{await fetchJson("/health");$("dot").className="dot on";$("online").dataset.state="online";$("online").textContent=tr("online")}catch{$("dot").className="dot off";$("online").dataset.state="offline";$("online").textContent=tr("offline")}
      try{cfg=await fetchJson("/admin/config");annotateCredentials();dirty=Boolean(cfg.dirty);applyLang()}catch(error){if(!cfg)toast(error.message);return}
      try{const snapshot=await fetchJson("/admin/freebuff/credentials?refresh=true");cfg.credentials=snapshot.credentials;annotateCredentials();renderCredentials()}catch(error){toast(tr("refreshFailed")+": "+error.message)}
    }
    async function waitForRestart(){
      const target=new URL(location.href);target.port=String(cfg.server.port);target.pathname="/dashboard";
      const deadline=Date.now()+30000;
      while(Date.now()<deadline){try{const health=await fetchJson("/health",{},target.origin);const view=await fetchJson("/admin/config",{},target.origin);if(health.status==="ok"&&!view.restart_required){localStorage.setItem("bridgeApiKey",adminAuthKey);location.href=target.href;return}}catch{}await new Promise((resolve)=>setTimeout(resolve,500))}
      throw new Error(tr("restartTimeout"));
    }
    document.querySelectorAll("[data-lang]").forEach((el)=>el.onclick=()=>{activeLang=el.dataset.lang;localStorage.setItem("dashboardLang",activeLang);applyLang()});
    document.querySelectorAll('input[name="routingPolicy"]').forEach((el)=>el.onchange=()=>{cfg.routing.policy=el.value;markDirty();render()});
    $("bindHost").onchange=()=>{cfg.server.host=$("bindHost").value;markDirty()};
    $("bindPort").oninput=()=>{cfg.server.port=Number($("bindPort").value)||9993;markDirty()};
    $("maxConcurrent").oninput=()=>{cfg.routing.maxConcurrent=Number($("maxConcurrent").value)||1;markDirty()};
    $("addCred").onclick=()=>{let number=1;while(cfg.credentials.some((item)=>item.id==="key"+number))number++;cfg.credentials.push({id:"key"+number,label:"key"+number,enabled:true,status:"none",remaining:null,isNew:true,authTokenConfigured:false});markDirty();renderCredentials()};
    $("refreshCreds").onclick=async()=>{try{const snapshot=await fetchJson("/admin/freebuff/credentials?refresh=true");cfg.credentials=snapshot.credentials;annotateCredentials();renderCredentials();toast(tr("refresh"))}catch(error){toast(tr("refreshFailed")+": "+error.message)}};
    $("save").onclick=async()=>{try{const pendingKey=pendingBridgeKey;cfg=await fetchJson("/admin/config",{method:"PUT",body:JSON.stringify({...(pendingKey?{bridgeApiKey:pendingKey}:{}),server:cfg.server,routing:{policy:cfg.routing.policy,maxConcurrent:Number(cfg.routing.maxConcurrent)||0},models:cfg.models.map(({id,enabled})=>({id,enabled})),credentials:credentialPayloads()})});if(pendingKey){adminAuthKey=pendingKey;localStorage.setItem("bridgeApiKey",pendingKey);pendingBridgeKey=""}annotateCredentials();dirty=true;applyLang();toast(tr("saveJson"))}catch(error){toast(tr("saveFailed")+": "+error.message)}};
    $("restart").onclick=async()=>{try{await fetchJson("/admin/restart",{method:"POST",body:"{}"});await waitForRestart()}catch(error){toast(tr("restartFailed")+": "+error.message)}};
    $("genKey").onclick=()=>{const bytes=crypto.getRandomValues(new Uint8Array(24));$("bridgeApiKey").value=Array.from(bytes,(byte)=>byte.toString(16).padStart(2,"0")).join("");pendingBridgeKey=fullBridgeKey();markDirty()};
    $("copyKey").onclick=async()=>{const key=fullBridgeKey();if(!key)return toast(tr("clientKeyEmpty"));await navigator.clipboard.writeText(key);toast(tr("copyClientApiKey"))};
    $("saveKey").onclick=async()=>{const key=fullBridgeKey();if(!key)return toast(tr("clientKeyEmpty"));if(pendingBridgeKey){pendingBridgeKey=key;markDirty();return toast(tr("saveClientApiKey"))}adminAuthKey=key;localStorage.setItem("bridgeApiKey",key);try{await load();toast(tr("online"))}catch(error){toast(error.message)}};
    function setModels(predicate,enabled){cfg.models.forEach((model)=>{if(predicate(model))model.enabled=enabled});markDirty();renderModels()}
    $("enableAllModels").onclick=()=>setModels(()=>true,true);$("disableAllModels").onclick=()=>setModels(()=>true,false);
    $("enablePremium").onclick=()=>setModels((model)=>model.premium,true);$("disablePremium").onclick=()=>setModels((model)=>model.premium,false);
    function setCredHelp(open){$("credHelp").classList.toggle("open",open);$("credHelp").setAttribute("aria-expanded",String(open))}
    $("credHelp").onclick=(event)=>{event.stopPropagation();setCredHelp(!$("credHelp").classList.contains("open"))};
    document.addEventListener("click",(event)=>{if(!$("credHelp").contains(event.target))setCredHelp(false)});
    document.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&$("credHelp").classList.contains("open")){setCredHelp(false);$("credHelp").focus()}});
    applyLang();load();
  `;
}
