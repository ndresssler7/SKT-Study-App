
const STORE_KEY="skt_v7_full";
const now=()=>Date.now();
const todayKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
const uid=(p)=>`${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
const DEFAULTS={goal:40,theme:"light",builder:{includeConcept:true,includeFacts:true,includeReq:true,caps:{concept:180,facts:260,req:140},minCharsConcept:350},srs:{againMinutes:10,hardDays:1,goodDays:3,easyDays:6}};
function baseState(){return{version:7,prefs:{theme:DEFAULTS.theme,goal:DEFAULTS.goal,mode:"mix",activeDocId:"",builder:{...DEFAULTS.builder}},game:{xp:0,lastDay:"",doneToday:0},stats:{streak:0,lastStudyDay:""},docs:[],cards:[]};}
function load(){try{const r=localStorage.getItem(STORE_KEY);if(!r)return baseState();const s=JSON.parse(r),d=baseState();return{...d,...s,prefs:{...d.prefs,...(s.prefs||{}),builder:{...d.prefs.builder,...(s.prefs?.builder||{})}},game:{...d.game,...(s.game||{})},stats:{...d.stats,...(s.stats||{})},docs:Array.isArray(s.docs)?s.docs:[],cards:Array.isArray(s.cards)?s.cards:[]};}catch{return baseState();}}
function save(){localStorage.setItem(STORE_KEY,JSON.stringify(S));}
let S=load();

const qs=(sel)=>document.querySelector(sel);
const qsa=(sel)=>Array.from(document.querySelectorAll(sel));
const esc=(s)=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

function applyTheme(){document.documentElement.setAttribute("data-theme",S.prefs.theme==="dark"?"dark":"light");}
function resetDaily(){const k=todayKey();if(S.game.lastDay!==k){S.game.doneToday=0;S.game.lastDay=k;save();}}
function bumpStreak(){const k=todayKey();if(S.stats.lastStudyDay===k)return;const y=new Date();y.setDate(y.getDate()-1);const yk=`${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`;S.stats.streak=(S.stats.lastStudyDay===yk)?(S.stats.streak||0)+1:1;S.stats.lastStudyDay=k;save();}
function addXP(x){resetDaily();S.game.xp=(S.game.xp||0)+x;save();}
function addDone(x=1){resetDaily();S.game.doneToday=Math.max(0,(S.game.doneToday||0)+x);save();}
function levelFromXP(xp){return Math.floor((xp||0)/250)+1;}

function freshSrs(){return{dueAt:0,reps:0,ease:2.5,interval:0,seen:0,wrong:0,correct:0,isNew:true};}

function ensureActiveDoc(){if(!S.prefs.activeDocId&&S.docs[0]){S.prefs.activeDocId=S.docs[0].id;save();}return S.docs.find(d=>d.id===S.prefs.activeDocId)||null;}
function setActiveDoc(id){S.prefs.activeDocId=id;save();renderAll();}

function studyCards(){const doc=ensureActiveDoc();if(!doc)return[];const mode=S.prefs.mode;return S.cards.filter(c=>c.docId===doc.id).filter(c=>{if(mode==="mix")return true;if(mode==="concept")return c.kind==="concept";if(mode==="facts")return c.kind==="facts";if(mode==="req")return c.kind==="req";return true;});}
function dueNowCount(){const t=now();return studyCards().filter(c=>!c.dueAt||c.dueAt<=t).length;}

function cleanText(raw){
  let t=String(raw||"").replace(/\\r/g,"");
  t=t.replace(/[ \\t]+/g," ").replace(/\\n{3,}/g,"\\n\\n").replace(/ +\\n/g,"\\n").trim();
  t=t.replace(/(Chapter)\\s*(\\d+)/gi,"$1 $2 ");
  t=t.replace(/(\\d+)\\.(\\d+)([A-Za-z])/g,"$1.$2 $3");
  t=t.replace(/([A-Za-z])\\.(\\d+)/g,"$1. $2");
  t=t.replace(/(\\d+\\.\\d+(?:\\.\\d+)*)\\.(\\S)/g,"$1. $2");
  t=t.replace(/(\\bChapter\\s+\\d+[^\\n]{0,80})\\n\\1/gi,"$1");
  return t.trim();
}
function normalizeLines(txt){
  const lines=txt.split("\\n");const out=[];let buf="";const endP=/[.!?]$/;
  for(const l0 of lines){
    const l=l0.trim();
    if(!l){if(buf){out.push(buf.trim());buf="";}continue;}
    if(/^((Chapter\\s+\\d+)|(\\d+\\.\\d+(\\.\\d+)*)|Section\\s+\\d+)\\b/i.test(l)){
      if(buf){out.push(buf.trim());buf="";}
      out.push(l);continue;
    }
    buf = buf? (buf+" "+l):l;
    if(endP.test(l) && buf.length>140){out.push(buf.trim());buf="";}
  }
  if(buf) out.push(buf.trim());
  return out.join("\\n");
}
function splitBySections(txt){
  const lines=txt.split(/\\n+/);const sections=[];let cur=[];
  const isHead=(l)=>/^((Chapter\\s+\\d+)|(\\d+\\.\\d+(\\.\\d+)*)|Section\\s+\\d+)\\b/i.test(l.trim());
  for(const l of lines){
    if(isHead(l) && cur.join(" ").length>450){sections.push(cur.join("\\n").trim());cur=[l];}
    else cur.push(l);
  }
  if(cur.join(" ").trim()) sections.push(cur.join("\\n").trim());
  return sections;
}
function splitSentences(txt){
  return txt.replace(/\\n+/g," ").split(/(?<=[.!?])\\s+/).map(s=>s.trim()).filter(s=>s.length>=40&&s.length<=260);
}
function extractDefinitionQA(s){
  const m1=s.match(/^(.{2,50}?)\\s+(is defined as|means|refers to)\\s+(.{10,200})$/i);
  if(m1){
    const term=m1[1].trim().replace(/[:\\-–]$/,"");
    const def=m1[3].trim().replace(/[.;]$/,"");
    if(term.length<=60&&def.length>=10) return {q:`What does "${term}" mean?`,a:def+"."};
  }
  const m2=s.match(/(.{6,120}?)\\s*\\((\\b[A-Z]{2,8}\\b)\\)/);
  if(m2){
    const phrase=m2[1].trim().replace(/[,:;]$/,"");
    const acr=m2[2].trim();
    if(phrase.length<=130) return {q:`What does "${acr}" stand for?`,a:phrase};
  }
  return null;
}
function makeConceptCards(docId,tag,txt,caps,minChars){
  const secs=splitBySections(txt);const cards=[];
  for(const sec of secs){
    const body=sec.trim(); if(body.length<minChars) continue;
    const firstLine=body.split("\\n")[0]||"Concept";
    const title=firstLine.replace(/\\s+/g," ").slice(0,92);
    cards.push({id:uid("c"),docId,kind:"concept",q:`Concept: ${title}`,a:body,tag,createdAt:now(),...freshSrs()});
    if(cards.length>=caps) break;
  }
  return cards;
}
function makeFactCards(docId,tag,txt,caps){
  const sents=splitSentences(txt);const cards=[];
  for(const s of sents){
    const qa=extractDefinitionQA(s);
    if(qa) cards.push({id:uid("f"),docId,kind:"facts",q:qa.q,a:qa.a,tag,createdAt:now(),...freshSrs()});
    else if(/\\b(NFPA|UFC|AFMAN|DAFMAN|DoDI|DoDM|TO)\\b/i.test(s))
      cards.push({id:uid("f"),docId,kind:"facts",q:"What does this statement say?",a:s,tag,createdAt:now(),...freshSrs()});
    if(cards.length>=caps) break;
  }
  const seen=new Set();
  return cards.filter(c=>{const k=c.q+"|"+c.a;if(seen.has(k)) return false; seen.add(k); return true;});
}
function makeRequirementCards(docId,tag,txt,caps){
  const sents=splitSentences(txt);
  const req=sents.filter(s=>/\\b(shall|must|required|minimum|prohibited|will not)\\b/i.test(s));
  const cards=[];
  for(const s of req){
    let q="Requirement: What is required here?";
    const m=s.match(/^(.{2,80}?)\\s+\\b(shall|must|required to|will not|is required to)\\b/i);
    if(m){const subj=m[1].trim(); if(subj.length>=3&&subj.length<=80) q=`Requirement: What must "${subj}" do?`;}
    cards.push({id:uid("r"),docId,kind:"req",q,a:s,tag,createdAt:now(),...freshSrs()});
    if(cards.length>=caps) break;
  }
  return cards;
}
function grade(card,choice){
  const c={...card}; c.seen=(c.seen||0)+1; c.isNew=false;
  if(choice===0){
    c.wrong=(c.wrong||0)+1; c.reps=0; c.interval=0; c.ease=Math.max(1.3,(c.ease||2.5)-0.2);
    c.dueAt=now()+DEFAULTS.srs.againMinutes*60*1000; return c;
  }
  c.correct=(c.correct||0)+1; c.reps=(c.reps||0)+1;
  if(choice===1) c.ease=Math.max(1.3,(c.ease||2.5)-0.05);
  if(choice===2) c.ease=Math.min(3.2,(c.ease||2.5)+0.05);
  if(choice===3) c.ease=Math.min(3.2,(c.ease||2.5)+0.12);
  if(c.reps===1) c.interval=DEFAULTS.srs.hardDays;
  else if(c.reps===2) c.interval=DEFAULTS.srs.goodDays;
  else c.interval=Math.round(Math.max(2,(c.interval||DEFAULTS.srs.goodDays)*(c.ease||2.5)));
  if(choice===1) c.interval=Math.max(1,Math.round(c.interval*0.70));
  if(choice===3) c.interval=Math.round(c.interval*1.25);
  c.dueAt=now()+c.interval*24*60*60*1000; return c;
}
function upsertCard(c){const i=S.cards.findIndex(x=>x.id===c.id); if(i>=0) S.cards[i]=c; save();}
function pickNext(){
  const list=studyCards(); if(!list.length) return null;
  const t=now();
  const due=list.filter(c=>!c.dueAt||c.dueAt<=t).sort((a,b)=>(a.dueAt||0)-(b.dueAt||0));
  return due[0]||list.sort((a,b)=>(a.dueAt||0)-(b.dueAt||0))[0];
}
function updateTop(){
  resetDaily();
  const doc=ensureActiveDoc();
  qs("#pillXP").textContent=String(S.game.xp||0);
  qs("#pillLvl").textContent=String(levelFromXP(S.game.xp||0));
  qs("#pillCards").textContent=String(studyCards().length);
  qs("#pillDue").textContent=String(dueNowCount());
  qs("#pillStreak").textContent=String(S.stats.streak||0);
  qs("#pillToday").textContent=`${S.game.doneToday||0}/${S.prefs.goal||DEFAULTS.goal}`;
  qs("#activeDocName").textContent=doc?doc.name:"None";
}
function setTab(name){
  qsa(".tab").forEach(t=>t.classList.toggle("active",t.dataset.t===name));
  qsa(".panel").forEach(p=>p.style.display=(p.id===name)?"":"none");
  renderAll();
}
let builderDraft={name:"",tag:"GENERAL",raw:"",cleaned:"",normalized:"",preview:{chars:0,concept:0,facts:0,req:0,warnings:[]}};
function previewCounts(cleaned){
  const norm=normalizeLines(cleaned);
  const secs=splitBySections(norm);
  const sents=splitSentences(norm);
  const req=sents.filter(s=>/\\b(shall|must|required|minimum|prohibited|will not)\\b/i.test(s));
  const defs=sents.filter(s=>extractDefinitionQA(s));
  const warnings=[];
  if(cleaned.length<800) warnings.push("Very short text — PDF may be scanned/blocked.");
  if(secs.length<3 && cleaned.length>4000) warnings.push("Text looks flattened — consider re-exporting TXT with better line breaks.");
  return {chars:cleaned.length,concept:secs.filter(s=>s.length>=DEFAULTS.builder.minCharsConcept).length,facts:defs.length,req:req.length,warnings};
}
function renderHome(){
  const el=qs("#home"); const doc=ensureActiveDoc();
  el.innerHTML=`<div class="card"><h2>Today's Mission</h2>
    <div class="sub">Goal <b>${esc(S.prefs.goal)}</b> · Due now <b>${dueNowCount()}</b> · Mode <b>${esc(S.prefs.mode)}</b></div>
    <div class="row" style="margin-top:12px"><button class="primary" id="start">Start studying</button><button id="build">Build / Import deck</button></div>
    <div class="notice" style="margin-top:12px"><b>PDG-style flow:</b> Import → preview → choose card types → build. Studying uses <b>Again / Hard / Good / Easy</b>.</div>
    <div class="sub" style="margin-top:10px">Active doc: <b>${doc?esc(doc.name):"None"}</b></div></div>`;
  qs("#start").onclick=()=>setTab("study");
  qs("#build").onclick=()=>setTab("builder");
}
function nextLabel(card,choice){
  const c=grade(card,choice);
  return choice===0?`${DEFAULTS.srs.againMinutes} min`:`${c.interval} day${c.interval===1?"":"s"}`;
}
function renderStudy(){
  const el=qs("#study"); const doc=ensureActiveDoc();
  if(!doc){el.innerHTML=`<div class="card"><h2>No deck yet</h2><div class="sub">Go to <b>Build</b> and import TXT or paste text.</div></div>`;return;}
  const card=pickNext();
  if(!card){el.innerHTML=`<div class="card"><h2>Nothing due</h2><div class="sub">Switch mode or import more material.</div></div>`;return;}
  el.innerHTML=`<div class="card">
    <div class="row" style="justify-content:space-between"><div class="tag">${esc(card.kind.toUpperCase())}</div><div class="smallmut">Next: <b>${card.dueAt?new Date(card.dueAt).toLocaleDateString():"Now"}</b></div></div>
    <div class="q">${esc(card.q)}</div><div class="a">${esc(card.a)}</div>
    <div class="sub" style="margin-top:10px">Pick one:</div>
    <div class="srs">
      <button class="again" data-g="0">Again<br><span class="smallmut">${esc(nextLabel(card,0))}</span></button>
      <button class="hard" data-g="1">Hard<br><span class="smallmut">${esc(nextLabel(card,1))}</span></button>
      <button class="good" data-g="2">Good<br><span class="smallmut">${esc(nextLabel(card,2))}</span></button>
      <button class="easy" data-g="3">Easy<br><span class="smallmut">${esc(nextLabel(card,3))}</span></button>
    </div>
  </div>`;
  qsa("button[data-g]").forEach(b=>b.onclick=()=>{bumpStreak();addDone(1);addXP(10);upsertCard(grade(card,parseInt(b.dataset.g,10)));renderAll();});
}
function renderWeak(){
  const el=qs("#weak");
  const list=studyCards().filter(c=>(c.wrong||0)>=2).sort((a,b)=>(b.wrong||0)-(a.wrong||0)).slice(0,20);
  el.innerHTML=`<div class="card"><h2>Weak notebook</h2><div class="sub">Missed 2+ times.</div>
    <div class="grid" style="margin-top:12px">${list.length?list.map(c=>`<div class="stat"><div style="font-weight:950">${esc(c.q)}</div><div class="smallmut" style="margin-top:6px">${esc(c.kind)} · ${c.wrong||0} wrong · ${c.seen||0} seen</div><button class="small" data-j="${esc(c.id)}" style="margin-top:10px">Review now</button></div>`).join(""):`<div class="sub">Nothing here yet.</div>`}</div></div>`;
  qsa("button[data-j]").forEach(b=>b.onclick=()=>{const id=b.dataset.j;const c=S.cards.find(x=>x.id===id);if(c){c.dueAt=0;upsertCard(c);}setTab("study");});
}
function clampInt(v,lo,hi){const n=parseInt(v,10);if(!Number.isFinite(n)) return lo; return Math.max(lo,Math.min(hi,n));}
function renderBuilder(){
  const el=qs("#builder");
  const docOpts=S.docs.map(d=>`<option value="${esc(d.id)}" ${S.prefs.activeDocId===d.id?"selected":""}>${esc(d.name)}</option>`).join("");
  const p=builderDraft.preview||{chars:0,concept:0,facts:0,req:0,warnings:[]};
  const warn=(p.warnings||[]).map(w=>`<div class="notice warn" style="margin-top:10px">${esc(w)}</div>`).join("");
  el.innerHTML=`<div class="card"><h2>Build deck (PDG-style)</h2><div class="sub">Import TXT or paste text → preview → choose types → build.</div>
    <hr>
    <div class="grid">
      <div class="stat"><label>Import TXT</label><div class="row" style="margin-top:10px"><input id="file" type="file" accept=".txt,.md"><button id="load" class="primary">Load</button></div></div>
      <div class="stat"><label>Paste</label><textarea id="paste" placeholder="Paste text here..."></textarea><div class="row" style="margin-top:10px"><button id="usePaste">Use pasted text</button><button id="clearPaste" class="ghost">Clear</button></div></div>
    </div>
    <hr>
    <div class="grid">
      <div class="stat"><label>Deck name</label><input id="name" value="${esc(builderDraft.name)}" placeholder="DAFMAN91-203 Ch 6"><div class="row" style="margin-top:10px"><label>Tag</label><input id="tag" value="${esc(builderDraft.tag)}" placeholder="UFC / NFPA / SAFETY"></div></div>
      <div class="stat"><label>Preview</label><div class="row" style="margin-top:10px"><div class="tag">${p.chars.toLocaleString()} chars</div><div class="tag">${p.concept} concept</div><div class="tag">${p.facts} facts</div><div class="tag">${p.req} req</div></div>${warn||`<div class="smallmut" style="margin-top:10px">Load text to see preview.</div>`}</div>
    </div>
    <hr>
    <div class="grid">
      <div class="stat"><label>Card types</label><div class="row" style="margin-top:10px">
        <label class="row"><input id="incConcept" type="checkbox" ${S.prefs.builder.includeConcept?"checked":""}> Concept</label>
        <label class="row"><input id="incFacts" type="checkbox" ${S.prefs.builder.includeFacts?"checked":""}> Facts</label>
        <label class="row"><input id="incReq" type="checkbox" ${S.prefs.builder.includeReq?"checked":""}> Requirements</label>
      </div><div class="smallmut" style="margin-top:10px">Requirements = highest yield. Concepts = understanding.</div></div>
      <div class="stat"><label>Card caps</label><div class="row" style="margin-top:10px">
        <div><div class="smallmut">Concept</div><input id="capConcept" type="number" min="20" max="400" value="${S.prefs.builder.caps.concept}" style="width:120px"></div>
        <div><div class="smallmut">Facts</div><input id="capFacts" type="number" min="20" max="600" value="${S.prefs.builder.caps.facts}" style="width:120px"></div>
        <div><div class="smallmut">Req</div><input id="capReq" type="number" min="20" max="400" value="${S.prefs.builder.caps.req}" style="width:120px"></div>
      </div></div>
    </div>
    <div class="row" style="margin-top:14px"><button class="primary" id="build">Build deck</button><button id="resetDraft" class="ghost">Reset draft</button></div>
    <hr>
    <div class="row" style="justify-content:space-between;align-items:flex-end"><div><label>Active document</label><div class="smallmut">Pick what you study right now.</div></div><select id="docSel">${docOpts||""}</select></div>
  </div>`;
  qs("#load").onclick=async()=>{const f=qs("#file").files?.[0]; if(!f){alert("Choose a TXT file.");return;} const raw=await f.text(); builderDraft.name=f.name; builderDraft.raw=raw; const cleaned=cleanText(raw); builderDraft.cleaned=cleaned; builderDraft.normalized=normalizeLines(cleaned); builderDraft.preview=previewCounts(cleaned); renderAll();};
  qs("#usePaste").onclick=()=>{const raw=qs("#paste").value.trim(); if(!raw){alert("Paste text first.");return;} builderDraft.name=builderDraft.name||"Pasted Text"; builderDraft.raw=raw; const cleaned=cleanText(raw); builderDraft.cleaned=cleaned; builderDraft.normalized=normalizeLines(cleaned); builderDraft.preview=previewCounts(cleaned); renderAll();};
  qs("#clearPaste").onclick=()=>{qs("#paste").value="";};
  qs("#resetDraft").onclick=()=>{builderDraft={name:"",tag:"GENERAL",raw:"",cleaned:"",normalized:"",preview:{chars:0,concept:0,facts:0,req:0,warnings:[]}}; renderAll();};
  const docSel=qs("#docSel"); if(docSel) docSel.onchange=()=>setActiveDoc(docSel.value);
  qs("#build").onclick=()=>{
    const name=(qs("#name").value.trim()||builderDraft.name||"Untitled");
    const tag=(qs("#tag").value.trim()||"GENERAL");
    const txt=(builderDraft.normalized||builderDraft.cleaned||"");
    if(!txt||txt.length<200){alert("Load or paste text first.");return;}
    S.prefs.builder.includeConcept=qs("#incConcept").checked;
    S.prefs.builder.includeFacts=qs("#incFacts").checked;
    S.prefs.builder.includeReq=qs("#incReq").checked;
    S.prefs.builder.caps={concept:clampInt(qs("#capConcept").value,20,400),facts:clampInt(qs("#capFacts").value,20,600),req:clampInt(qs("#capReq").value,20,400)};
    save();
    const docId=uid("d");
    S.docs.unshift({id:docId,name,tag,createdAt:now(),meta:{chars:txt.length,previewCounts:builderDraft.preview}});
    const cards=[];
    if(S.prefs.builder.includeConcept) cards.push(...makeConceptCards(docId,tag,txt,S.prefs.builder.caps.concept,DEFAULTS.builder.minCharsConcept));
    if(S.prefs.builder.includeFacts) cards.push(...makeFactCards(docId,tag,txt,S.prefs.builder.caps.facts));
    if(S.prefs.builder.includeReq) cards.push(...makeRequirementCards(docId,tag,txt,S.prefs.builder.caps.req));
    if(!cards.length) cards.push({id:uid("c"),docId,kind:"concept",q:"Concept: Imported text",a:txt.slice(0,1200),tag,createdAt:now(),...freshSrs()});
    S.cards.push(...cards);
    S.prefs.activeDocId=docId; save();
    builderDraft={name:"",tag:"GENERAL",raw:"",cleaned:"",normalized:"",preview:{chars:0,concept:0,facts:0,req:0,warnings:[]}};
    setTab("home");
  };
}
function renderStats(){
  const el=qs("#stats"); const list=studyCards(); const seen=list.reduce((a,c)=>a+(c.seen||0),0); const wrong=list.reduce((a,c)=>a+(c.wrong||0),0);
  el.innerHTML=`<div class="card"><h2>Stats</h2><div class="grid" style="margin-top:12px">
    <div class="stat"><div class="smallmut">Cards (mode)</div><div style="font-weight:950;font-size:20px">${list.length}</div></div>
    <div class="stat"><div class="smallmut">Due now</div><div style="font-weight:950;font-size:20px">${dueNowCount()}</div></div>
    <div class="stat"><div class="smallmut">Reviews</div><div style="font-weight:950;font-size:20px">${seen}</div></div>
    <div class="stat"><div class="smallmut">Wrong</div><div style="font-weight:950;font-size:20px">${wrong}</div></div>
    <div class="stat"><div class="smallmut">XP</div><div style="font-weight:950;font-size:20px">${S.game.xp||0}</div></div>
    <div class="stat"><div class="smallmut">Streak</div><div style="font-weight:950;font-size:20px">${S.stats.streak||0}</div></div>
  </div></div>`;
}
function renderSettings(){
  const el=qs("#settings");
  el.innerHTML=`<div class="card"><h2>Settings</h2>
    <div class="row" style="justify-content:space-between;margin-top:12px">
      <div><div style="font-weight:950">Theme</div><div class="smallmut">${esc(S.prefs.theme)}</div></div>
      <label class="switch"><input id="th" type="checkbox" ${S.prefs.theme==="dark"?"checked":""}><span class="slider"></span></label>
    </div><hr>
    <div class="row" style="justify-content:space-between"><div><div style="font-weight:950">Daily goal</div><div class="smallmut">Default 40.</div></div><input id="goal" type="number" min="5" max="200" value="${S.prefs.goal}" style="width:120px"></div>
    <hr>
    <div class="row" style="justify-content:space-between;align-items:flex-end"><div><div style="font-weight:950">Study filter</div><div class="smallmut">Mix = all card types.</div></div>
      <select id="mode"><option value="mix" ${S.prefs.mode==="mix"?"selected":""}>Mix</option><option value="concept" ${S.prefs.mode==="concept"?"selected":""}>Concept</option><option value="facts" ${S.prefs.mode==="facts"?"selected":""}>Facts</option><option value="req" ${S.prefs.mode==="req"?"selected":""}>Requirements</option></select>
    </div>
    <div class="row" style="margin-top:12px"><button class="primary" id="save">Save</button><button id="goBuild">Build</button></div>
    <div class="notice warn" style="margin-top:14px"><b>Sync note:</b> stored on this device/browser only.</div>
  </div>`;
  qs("#th").onchange=(e)=>{S.prefs.theme=e.target.checked?"dark":"light";save();applyTheme();renderAll();};
  qs("#save").onclick=()=>{const g=parseInt(qs("#goal").value,10);S.prefs.goal=Number.isFinite(g)?Math.max(5,Math.min(200,g)):DEFAULTS.goal;S.prefs.mode=qs("#mode").value;save();renderAll();};
  qs("#goBuild").onclick=()=>setTab("builder");
}
function renderFooter(){
  updateTop();
  qs("#btnResetAll").onclick=()=>{if(!confirm("Reset all progress?")) return; S.cards=S.cards.map(c=>({...c,...freshSrs()})); S.stats={streak:0,lastStudyDay:""}; S.game.doneToday=0; S.game.lastDay=todayKey(); save(); renderAll();};
}
function renderAll(){
  applyTheme(); ensureActiveDoc(); updateTop();
  renderHome(); renderStudy(); renderBuilder(); renderWeak(); renderStats(); renderSettings(); renderFooter();
}
window.addEventListener("load",()=>{applyTheme(); qsa(".tab").forEach(t=>t.onclick=()=>setTab(t.dataset.t)); renderAll();});
