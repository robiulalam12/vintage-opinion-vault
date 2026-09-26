(() => {
  if (window.__pobPolicyContent) return; window.__pobPolicyContent = true;
  const norm = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => { const r = el?.getBoundingClientRect(); return Boolean(r && r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== "hidden"); };
  const directText = (el) => { const label = el?.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el?.closest?.("label"); return norm([el?.placeholder, el?.getAttribute?.("aria-label"), el?.name, el?.id, label?.innerText].join(" ")); };
  const context = (el) => { let text = [directText(el)]; let node = el?.parentElement; for (let i=0; i<4 && node; i++, node=node.parentElement) { const value = norm(node.innerText); if (value.length < 400) text.push(value); } return norm(text.join(" ")); };
  const fields = () => Array.from(document.querySelectorAll("input,textarea,select,[role=radio],[role=checkbox]")).filter(visible);
  const pick = (tag, words, skip=[]) => {
    const candidates = fields().filter((el) => !tag || el.tagName.toLowerCase() === tag).filter((el) => !skip.some((word) => directText(el).includes(word)));
    return candidates.find((el) => words.some((word) => directText(el).includes(word))) || candidates.find((el) => words.some((word) => context(el).includes(word))) || null;
  };
  function setValue(el, value) { if (!el) return false; const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set; el.focus(); setter ? setter.call(el, value) : (el.value = value); ["input","change","keyup"].forEach((type) => el.dispatchEvent(new Event(type,{bubbles:true}))); el.blur(); return el.value === value; }
  function setSelect(el, value) { if (!el) return false; const option = Array.from(el.options).find((o) => norm(o.textContent) === norm(value)) || Array.from(el.options).find((o) => norm(o.textContent).startsWith(norm(value))); if (!option) return false; el.value=option.value; el.dispatchEvent(new Event("change",{bubbles:true})); return true; }
  function checkedControl(el) { if (!el) return null; if (el.matches?.('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]')) return el; return el.querySelector?.('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"]') || (el.htmlFor ? document.getElementById(el.htmlFor) : null); }
  function setChecked(el, checked) { const control=checkedControl(el); if (!control) return false; const current = control.checked ?? control.getAttribute("aria-checked") === "true"; if (current !== checked) control.click(); return (control.checked ?? control.getAttribute("aria-checked") === "true") === checked; }
  function findByExactText(selector, text) { return Array.from(document.querySelectorAll(selector)).find((el) => norm(el.innerText || el.value || el.getAttribute("aria-label")) === norm(text) && visible(el)); }
  const CONTROL_SEL = 'input:not([type=hidden]),textarea,select,[role=radio],[role=checkbox],[role=combobox],[role=listbox],material-dropdown-select,[aria-haspopup=listbox],[aria-haspopup=true]';
  const controlsIn = (node) => node.querySelectorAll ? node.querySelectorAll(CONTROL_SEL).length : 0;
  // Google's Angular forms put the question text in a sibling element, not a <label>. Climb until an
  // ancestor holds the question text but still only a couple of controls, so labels are never borrowed.
  function labelText(el) {
    const parts=[directText(el)]; let node=el.parentElement;
    for (let i=0;i<8&&node;i++,node=node.parentElement){ if(controlsIn(node)>3) break; parts.push(norm(node.innerText)); }
    return norm(parts.join(" "));
  }
  const allControls = () => Array.from(document.querySelectorAll(CONTROL_SEL)).filter(visible).filter((el)=>!el.closest("#pob-policy-runner,header,[role=search]"));
  const find = (kind, words, skip=[]) => {
    const pool = allControls().filter((el)=>{
      const tag=el.tagName.toLowerCase(), role=el.getAttribute("role"), type=(el.getAttribute("type")||"").toLowerCase();
      if(kind==="text") return (tag==="input"&&!["checkbox","radio","submit","button","email","search"].includes(type)&&role!=="combobox") ;
      if(kind==="textarea") return tag==="textarea";
      if(kind==="check") return type==="checkbox"||role==="checkbox";
      if(kind==="radio") return type==="radio"||role==="radio";
      if(kind==="dropdown") return tag==="select"||tag==="material-dropdown-select"||role==="combobox"||role==="listbox"||el.hasAttribute("aria-haspopup");
      return true;
    });
    const ok=(t)=>words.some((w)=>t.includes(w))&&!skip.some((w)=>t.includes(w));
    return pool.find((el)=>ok(directText(el))) || pool.find((el)=>ok(labelText(el))) || null;
  };
  async function waitFor(fn, ms=15000){ const end=Date.now()+ms; while(Date.now()<end){ const v=fn(); if(v) return v; await sleep(300);} return null; }
  async function typeInto(el, value){
    if(!el) return false; if(el.value===value) return true;
    el.scrollIntoView({block:"center"}); el.focus(); el.click?.();
    try{ el.select?.(); document.execCommand("selectAll",false); document.execCommand("insertText",false,value); }catch{}
    if(el.value!==value){ const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,value); }
    ["input","change","keyup"].forEach((t)=>el.dispatchEvent(new Event(t,{bubbles:true})));
    el.dispatchEvent(new FocusEvent("blur",{bubbles:true})); el.blur(); await sleep(150);
    return el.value===value;
  }
  const isOn=(el)=>{ const c=el.matches?.("input")?el:(el.querySelector?.("input[type=checkbox],input[type=radio]")||null); if(c&&typeof c.checked==="boolean") return c.checked; const a=(el.getAttribute("aria-checked")||el.querySelector?.("[aria-checked]")?.getAttribute("aria-checked")); return a==="true"; };
  async function setOn(el, want){ if(!el) return false; if(isOn(el)===want) return true; el.scrollIntoView({block:"center"}); el.click(); await sleep(250); if(isOn(el)!==want){ (el.closest("label,material-checkbox,material-radio")||el).click(); await sleep(250);} return isOn(el)===want; }
  const bg=(message)=>new Promise((resolve)=>{try{chrome.runtime.sendMessage(message,(r)=>resolve(chrome.runtime.lastError?{ok:false}:r));}catch{resolve({ok:false});}});
  async function realClick(el){ el.scrollIntoView({block:"center"}); await sleep(250); const r=el.getBoundingClientRect(); const res=await bg({type:"policy-click",x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}); if(!res?.ok){ ["pointerdown","mousedown","pointerup","mouseup","click"].forEach((t)=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}))); } await sleep(500); }
  // Locate the country control: by label first, then by the "Country" question text and the nearest clickable box after it.
  function countryControl(){
    const byLabel=find("dropdown",["country"]); if(byLabel) return byLabel;
    const input=find("text",["country"]); if(input) return input;
    const heads=Array.from(document.querySelectorAll("div,span,label,p,legend,h2,h3")).filter((n)=>visible(n)&&/country/i.test(n.innerText||"")&&(n.innerText||"").length<120&&!n.closest("#pob-policy-runner"));
    for(const h of heads){ let node=h; for(let i=0;i<5&&node;i++,node=node.parentElement){ const c=node.querySelector('material-dropdown-select,[role=combobox],[role=listbox],[aria-haspopup],[role=button]:not(header *),select,input:not([type=hidden]),dropdown-button,[tabindex="0"]'); if(c&&visible(c)&&!c.closest("header,[role=search],#pob-policy-runner")) return c; } }
    return null;
  }
  const optionList=()=>Array.from(document.querySelectorAll('[role=option],material-select-dropdown-item,material-select-item,.item,li')).filter(visible).filter((o)=>!o.closest("#pob-policy-runner"));
  const matchOpt=(want)=>{ const opts=optionList(); return opts.find((o)=>norm(o.innerText)===want)||opts.find((o)=>norm(o.innerText).startsWith(want))||opts.find((o)=>norm(o.innerText).includes(want)); };
  async function chooseCountry(value){
    const want=norm(value); if(!want) return false;
    const el=await waitFor(countryControl,10000);
    if(!el) return false;
    if(el.tagName==="SELECT") return setSelect(el,value);
    const shows=()=>norm(el.innerText||el.value||el.querySelector?.("input")?.value||"").includes(want);
    if(shows()) return true;
    const before=allControls().length;
    for(let attempt=1;attempt<=3;attempt++){
      const input=el.tagName==="INPUT"?el:el.querySelector?.("input:not([type=hidden])");
      await realClick(input||el.querySelector?.("[role=button],[role=combobox],[aria-haspopup],dropdown-button,.button")||el);
      let opt=matchOpt(want);
      if(!opt){ const typing=document.activeElement?.tagName==="INPUT"?document.activeElement:input; if(typing){ typing.focus(); try{typing.select?.();}catch{} await bg({type:"policy-type",text:value}); if(typing.value!==value) await typeInto(typing,value); await sleep(900); opt=matchOpt(want); } }
      if(opt){ await realClick(opt); }
      else { await bg({type:"policy-type",text:"",keys:["ArrowDown","Enter"]}); await sleep(600); }
      await sleep(700);
      if(shows()||allControls().length>before+2) return true;
      await bg({type:"policy-type",text:"",keys:["Escape"]});
    }
    return shows()||allControls().length>before+2;
  }
  function gateMessage(){ const t=norm(document.body?.innerText); if(t.includes("continue with google")&&t.includes("verify")&&!allControls().some((el)=>el.tagName==="TEXTAREA")) return "Google is asking you to sign in / verify your email on this form. Sign in to Google in this browser, then Resume."; return ""; }
  async function fill(payload, details, log=()=>{}) {
    if ((payload.reportText || "").length > 1000) return { ok:false, reason:"Report exceeds Google's 1,000-character limit." };
    const gate=gateMessage(); if(gate) return {ok:false,reason:gate};
    const result={};
    const step=async(key,fn)=>{ log(`Filling: ${key}…`); try{ result[key]=Boolean(await fn()); }catch{ result[key]=false; } };
    await step("country",()=>chooseCountry(details.country));
    await step("name",async()=>typeInto(await waitFor(()=>find("text",["full legal name","legal name","your name"],["signature"])),details.fullName));
    await step("myself",async()=>setOn(await waitFor(()=>allControls().find((el)=>(el.getAttribute("role")==="radio"||el.type==="radio")&&norm(el.innerText||labelText(el)).startsWith("myself"))||find("radio",["myself"],["someone else"])),true));
    await step("otherUnchecked",async()=>{ const el=find("check",["other than a review"]); return el?setOn(el,false):true; });
    await step("url",async()=>typeInto(await waitFor(()=>find("text",["url"],["signature","legal name","search"])),payload.url));
    await step("explanation",async()=>typeInto(await waitFor(()=>find("textarea",["explain","unlawful","why"])||allControls().find((el)=>el.tagName==="TEXTAREA")),payload.reportText));
    await step("confirm",async()=>setOn(await waitFor(()=>find("check",["tick to confirm","good faith","confirm"],["other than a review"])),true));
    await step("signature",async()=>typeInto(await waitFor(()=>find("text",["signature","sign"],["full legal name"])),details.fullName));
    const failures = Object.entries(result).filter(([,ok]) => !ok).map(([key]) => key);
    return { ok: failures.length === 0, fields: result, reason: failures.length ? `Could not fill: ${failures.join(", ")}. Fill those by hand and press Resume, or send a screenshot.` : "" };
  }
  function siteKey() { const holder=document.querySelector("[data-sitekey]"); if(holder) return holder.getAttribute("data-sitekey"); const frame=Array.from(document.querySelectorAll("iframe")).find((f)=>/recaptcha\/(api2|enterprise)\/anchor/.test(f.src||"")); try{return frame?new URL(frame.src).searchParams.get("k"):null;}catch{return null;} }
  function applyToken(token) { let nodes=Array.from(document.querySelectorAll('[name="g-recaptcha-response"]')); if(!nodes.length){const el=document.createElement("textarea");el.name="g-recaptcha-response";el.hidden=true;document.forms[0]?.appendChild(el);nodes=[el];} nodes.forEach((el)=>{el.value=token;el.dispatchEvent(new Event("change",{bubbles:true}));}); }
  function submitButton(){return findByExactText('button,input[type=submit],[role=button]',"Submit");}
  function confirmed(){const text=norm(document.body?.innerText);return ["thank you for your report","your request has been submitted","we have received your","reference number"].some((x)=>text.includes(x));}
  function caseRef(){const text=document.body?.innerText||"";return text.match(/(?:reference number|case (?:id|number))[^\w]*([\w-]{4,})/i)?.[1]||"";}
  async function send(message){return new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,(response)=>chrome.runtime.lastError?reject(new Error(chrome.runtime.lastError.message)):resolve(response)));}
  function captchaInfo(){const key=siteKey();if(!key)return null;const holder=document.querySelector("[data-sitekey]");const html=document.documentElement.innerHTML;const frame=Array.from(document.querySelectorAll("iframe")).find((f)=>/recaptcha\/(api2|enterprise)\/anchor/.test(f.src||""));let invisible=holder?.getAttribute("data-size")==="invisible";try{if(frame&&new URL(frame.src).searchParams.get("size")==="invisible")invisible=true;}catch{}return{siteKey:key,pageUrl:location.href,enterprise:/recaptcha\/enterprise/.test(html),invisible,dataS:holder?.getAttribute("data-s")||""};}
  function googleError(){const text=norm(document.body?.innerText);return ["captcha","verification failed","please try again","something went wrong"].find((x)=>text.includes(x)&&!confirmed())||"";}
  async function clickSubmit(){const button=submitButton();if(!button)return false;button.scrollIntoView({block:"center"});await sleep(300);const r=button.getBoundingClientRect();const clicked=await send({type:"policy-click",x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}).catch(()=>null);if(!clicked?.ok)button.click();return true;}
  async function submit(log,cancelled,maxTries=10){
    let lastReason="Google did not show a confirmation.";
    for(let attempt=1;attempt<=maxTries;attempt++){
      if(cancelled())return{ok:false,reason:"cancelled"};
      if(confirmed())return{ok:true,caseRef:caseRef()};
      const info=captchaInfo();let solvedId="";
      if(info){
        log(`Captcha attempt ${attempt}/${maxTries}: sending to 2Captcha…`);
        const solved=await send({type:"policy-captcha",...info}).catch((e)=>({ok:false,error:e.message}));
        if(!solved?.ok){lastReason=solved?.error||"Captcha failed";if(solved?.fatal)return{ok:false,fatal:true,reason:lastReason};log(`Captcha attempt ${attempt}/${maxTries} failed: ${lastReason}. Retrying…`);await sleep(3000);continue;}
        solvedId=solved.id;applyToken(solved.token);await send({type:"policy-captcha-callback",token:solved.token}).catch(()=>{});await sleep(1200);
        if(confirmed())return{ok:true,caseRef:caseRef()};
      }
      if(!(await clickSubmit()))return{ok:false,reason:"Submit is disabled or missing. Check required fields."};
      log(`Submitted (attempt ${attempt}/${maxTries}); waiting for Google…`);
      for(let i=0;i<30;i++){await sleep(1000);if(confirmed())return{ok:true,caseRef:caseRef()};if(cancelled())return{ok:false,reason:"cancelled"};}
      lastReason=googleError()?`Google said: "${googleError()}"`:"No confirmation from Google after submit.";
      if(solvedId)await send({type:"policy-captcha-bad",id:solvedId}).catch(()=>{});
      log(`Attempt ${attempt}/${maxTries} not accepted (${lastReason}). Solving a fresh captcha…`);
      await sleep(2000);
    }
    return {ok:false,reason:`${lastReason} (tried ${maxTries} times)`};
  }
  window.POB_POLICY = { norm,sleep,fill,submit,confirmed,caseRef };
})();
