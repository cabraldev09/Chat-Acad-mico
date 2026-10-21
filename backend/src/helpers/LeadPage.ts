import Course from "../models/Course";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";

// The public page of capture (the form of the site and the link of an affiliate): who we are, what we offer (distance learning and blended
// courses), the tutoring after the enrollment, the steps, the courses and the form. It never shows a price or promises a result: it invites the
// person to talk to a consultant. One file of HTML (the style and the script carry the nonce of the request), no libraries, fast on a phone.
// The look follows Apple's Human Interface Guidelines: the system font, semantic colors with light and dark, an 8-point grid, targets of at least
// 44 points, a visible focus ring, and motion that stops when the person asks for less of it.
const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const MODALITY_ORDER = ["EAD", "Semipresencial", "Flex", "Presencial"];
const MODALITY_NOTE: Record<string, string> = {
  EAD: "Aulas online, no seu horário",
  Semipresencial: "Aulas online e encontros no polo"
};
// courses listed before "show all"
const COURSES_SHOWN = 8;

export interface LeadPageOptions {
  title: string;
  color: string;
  courses: Course[];
  // who sent the person here (the first name of the affiliate), when there is one
  referrer?: string;
  // the title the administration chose for the form; the default one is replaced by the headline of the page
  customTitle?: boolean;
  thanks?: string;
  // the nonce of the request: the style and the script of the page are the only ones the browser runs
  nonce: string;
  // the address of this server (the preview image of a link shared on WhatsApp must be absolute)
  baseUrl?: string;
  // a link to the privacy notice, when the company has one (https only)
  privacyUrl?: string;
}

// a color the page can use as a fill and as text: only #rrggbb comes in
const safeColor = (c: string): string => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#0B4279");

const ICON = {
  screen: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/></svg>`,
  people: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c1.8.8 3 2.6 3 5.6"/></svg>`,
  chat: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>`,
  cap: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/></svg>`,
  check: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"/></svg>`,
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`
};

const CSS = (color: string): string => `
:root{color-scheme:light dark;--tint:${color};--tint-ink:#fff;--link:${color};--bg:#fff;--bg2:#f2f2f7;--card:#fff;--label:#1d1d1f;--label2:#6e6e73;--sep:rgba(60,60,67,.2);--field:#f2f2f7;--err:#c4001a;--ok:#1a7f37;--ring:rgba(0,113,227,.55);--tint-soft:rgba(11,66,121,.1);
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display","Helvetica Neue",Arial,sans-serif;
--r-sm:10px;--r-md:14px;--r-lg:20px;--r-xl:28px;--ease:cubic-bezier(.25,.1,.25,1)}
@media(prefers-color-scheme:dark){:root{--tint-ink:#fff;--link:#6cb6ff;--bg:#000;--bg2:#1c1c1e;--card:#1c1c1e;--label:#f5f5f7;--label2:#a1a1a6;--sep:rgba(84,84,88,.6);--field:#2c2c2e;--err:#ff8a80;--ok:#30d158;--ring:rgba(10,132,255,.75);--tint-soft:rgba(108,182,255,.16)}}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;scroll-padding-top:72px}
body{margin:0;font-family:var(--font);font-size:17px;line-height:1.47;color:var(--label);background:var(--bg);-webkit-font-smoothing:antialiased}
img,svg{max-width:100%}
a{color:var(--link)}
h1,h2,h3{margin:0;font-weight:700;letter-spacing:-.02em;line-height:1.12}
p{margin:0}
:focus-visible{outline:3px solid var(--ring);outline-offset:2px;border-radius:6px}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:12px;top:-60px;background:var(--tint);color:var(--tint-ink);padding:12px 18px;border-radius:var(--r-sm);z-index:20;text-decoration:none;font-weight:600}
.skip:focus{top:12px}
/* top bar */
.nav{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--sep)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;min-height:60px;gap:12px}
.logo{display:block;height:36px;width:auto}
.logo-dark{display:none}
@media(prefers-color-scheme:dark){.logo-light{display:none}.logo-dark{display:block}}
/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 28px;border:0;border-radius:999px;background:var(--tint);color:var(--tint-ink);font:inherit;font-size:17px;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .1s var(--ease),filter .2s var(--ease)}
.btn:hover{filter:brightness(1.12)}
.btn:active{transform:scale(.98)}
.btn[disabled]{opacity:.55;cursor:default;filter:none;transform:none}
.btn-sm{min-height:44px;padding:0 20px;font-size:15px}
.btn-block{width:100%}
.link{display:inline-flex;align-items:center;min-height:44px;font-weight:600;text-decoration:none}
.link:hover{text-decoration:underline}
/* hero */
.hero{padding:40px 0 56px}
.hero .wrap{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:40px;align-items:center}
.ref{display:inline-flex;align-items:center;min-height:32px;padding:0 14px;border-radius:999px;background:var(--tint-soft);color:var(--link);font-size:14px;font-weight:600;margin-bottom:16px}
.eyebrow{color:var(--label2);font-size:15px;font-weight:600;margin-bottom:12px}
h1{font-size:clamp(34px,6vw,56px);letter-spacing:-.03em;margin-bottom:16px}
.lede{font-size:clamp(18px,2.2vw,21px);line-height:1.4;color:var(--label2);max-width:34em;margin-bottom:28px}
.actions{display:flex;flex-wrap:wrap;gap:8px 24px;align-items:center}
.facts{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:28px 0 0;padding:0}
.facts li{padding:6px 14px;border-radius:999px;background:var(--bg2);font-size:14px;font-weight:600}
.media{margin:0;border-radius:var(--r-xl);background:linear-gradient(160deg,#08213f 0%,var(--tint) 55%,#0693e3 100%);overflow:hidden;display:flex;align-items:flex-end;justify-content:center;min-height:320px}
.media img{display:block;width:100%;height:auto}
/* sections */
.section{padding:64px 0}
.section.alt{background:var(--bg2)}
.section h2{font-size:clamp(28px,4vw,40px);margin-bottom:12px}
.sub{color:var(--label2);font-size:19px;line-height:1.4;max-width:36em;margin-bottom:32px}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--sep);border-radius:var(--r-lg);padding:24px}
.section.alt .card{border-color:transparent}
.ic{width:48px;height:48px;border-radius:var(--r-md);display:grid;place-items:center;background:var(--tint-soft);color:var(--link);margin-bottom:16px}
.card h3{font-size:20px;margin-bottom:8px}
.card p{color:var(--label2);font-size:16px}
/* courses */
.find{position:relative;max-width:420px;margin-bottom:28px}
.find svg{position:absolute;left:14px;top:13px;color:var(--label2)}
.find input{padding-left:42px}
.group{margin-bottom:28px}
.group h3{font-size:20px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;margin-bottom:12px}
.group h3 small{font-size:14px;font-weight:500;color:var(--label2)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{min-height:44px;padding:0 18px;border:0;border-radius:999px;background:var(--bg2);color:var(--label);font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s var(--ease),transform .1s var(--ease)}
.section.alt .chip{background:var(--card)}
.chip:hover{background:var(--tint-soft);color:var(--link)}
.chip:active{transform:scale(.97)}
.chip[hidden]{display:none}
.more{margin-top:8px}
.empty{color:var(--label2)}
/* steps */
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;list-style:none;margin:0;padding:0}
.step{background:var(--card);border-radius:var(--r-lg);padding:24px}
.step b{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--tint);color:var(--tint-ink);font-size:17px;margin-bottom:16px}
.step h3{font-size:19px;margin-bottom:8px}.step p{color:var(--label2);font-size:16px}
.tutor{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:center;background:var(--card);border:1px solid var(--sep);border-radius:var(--r-xl);padding:32px}
.tutor .ic{width:72px;height:72px;border-radius:var(--r-lg);margin:0}
.tutor h2{font-size:clamp(24px,3vw,30px);margin-bottom:8px}.tutor p{color:var(--label2);max-width:40em}
/* form */
.formbox{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:40px;align-items:start}
.formbox .side p{color:var(--label2);font-size:19px;line-height:1.4;margin-bottom:20px}
.formbox ul{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.formbox li{display:flex;gap:12px;align-items:flex-start;font-size:16px}
.formbox li:before{content:"";flex:none;width:22px;height:22px;margin-top:1px;border-radius:50%;background:var(--tint-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230B4279' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 12.5l4 4 8-9'/%3E%3C/svg%3E") center/14px no-repeat}
form,.done{background:var(--card);border:1px solid var(--sep);border-radius:var(--r-xl);padding:28px;display:grid;gap:16px}
.field{display:grid;gap:6px}
label,.lab{font-size:15px;font-weight:600}
input,select{width:100%;min-height:52px;padding:0 16px;border:2px solid transparent;border-radius:var(--r-md);background:var(--field);color:var(--label);font:inherit;font-size:17px}
input::placeholder{color:var(--label2)}
input:focus-visible,select:focus-visible{outline:none;border-color:var(--link);box-shadow:0 0 0 4px var(--ring)}
input[aria-invalid=true]{border-color:var(--err)}
.err-t{min-height:0;color:var(--err);font-size:14px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
details.more-fields{border-radius:var(--r-md);background:var(--field);padding:0 16px}
details.more-fields summary{min-height:48px;display:flex;align-items:center;cursor:pointer;font-weight:600;color:var(--link);list-style:none}
details.more-fields summary::-webkit-details-marker{display:none}
details.more-fields .in{display:grid;gap:16px;padding-bottom:16px}
details.more-fields input,details.more-fields select{background:var(--card)}
.consent{display:flex;gap:12px;align-items:flex-start;font-weight:400;font-size:14px;color:var(--label2);line-height:1.4}
.consent input{flex:none;width:24px;min-height:24px;height:24px;margin:0;accent-color:var(--tint)}
.hp{position:absolute;left:-9999px}
.msg{padding:14px 16px;border-radius:var(--r-md);background:rgba(215,0,21,.1);color:var(--err);font-size:15px}
.msg[hidden]{display:none}
.safe{font-size:13px;color:var(--label2);text-align:center}
.done{text-align:center;justify-items:center}
.done[hidden]{display:none}
.done .ok{width:72px;height:72px;border-radius:50%;background:rgba(26,127,55,.14);color:var(--ok);display:grid;place-items:center}
.done h3{font-size:24px}.done p{color:var(--label2)}
.done h3:focus{outline:none}
/* faq */
.faq-list{display:grid;gap:8px;max-width:760px}
.faq-list details{background:var(--card);border-radius:var(--r-md);padding:0 20px}
.faq-list summary{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;font-size:17px;font-weight:600;list-style:none}
.faq-list summary::-webkit-details-marker{display:none}
.faq-list summary::after{content:"";flex:none;width:10px;height:10px;border-right:2px solid var(--label2);border-bottom:2px solid var(--label2);transform:rotate(45deg);transition:transform .2s var(--ease)}
.faq-list details[open] summary::after{transform:rotate(-135deg)}
.faq-list p{color:var(--label2);padding-bottom:18px}
footer{padding:32px 0 96px;color:var(--label2);font-size:13px;text-align:center}
footer a{color:inherit}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:9;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--sep);display:none}
.bar.off{display:none!important}
@media(max-width:900px){.hero .wrap,.formbox{grid-template-columns:1fr}.hero{padding-top:24px}.cards,.steps{grid-template-columns:1fr}.media{order:-1;min-height:0}.bar{display:block}.tutor{grid-template-columns:1fr}}
@media(max-width:480px){.wrap{padding:0 16px}.row{grid-template-columns:1fr}form,.done{padding:20px}.section{padding:48px 0}.actions .btn{width:100%}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

const SCRIPT = `
(function(){
var q=new URLSearchParams(location.search);
var doc=document;
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var course=doc.getElementById('course');
var f=doc.getElementById('f');
function go(id){var el=doc.getElementById(id);if(el)el.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})}
function pick(id){course.value=String(id);go('falar');setTimeout(function(){var n=f.elements.name;if(n)n.focus({preventScroll:true})},reduce?0:450)}
Array.prototype.forEach.call(doc.querySelectorAll('[data-course]'),function(b){b.addEventListener('click',function(){pick(b.getAttribute('data-course'))})});
if(q.get('curso')&&course.querySelector('option[value="'+q.get('curso')+'"]'))course.value=q.get('curso');

// the list of courses: the first ones, "show all", and a search that looks at every course
var list=doc.getElementById('courses'),all=doc.getElementById('showAll'),find=doc.getElementById('find'),none=doc.getElementById('none');
function norm(s){return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()}
function apply(){
  if(!list)return;
  var t=norm(find&&find.value).trim(),open=list.getAttribute('data-open')==='1',shown=0;
  Array.prototype.forEach.call(list.querySelectorAll('.chip'),function(c){
    var hit=!t||norm(c.textContent).indexOf(t)>-1;
    var visible=t?hit:(open||c.getAttribute('data-extra')!=='1');
    c.hidden=!visible;if(visible)shown++;
  });
  Array.prototype.forEach.call(list.querySelectorAll('.group'),function(g){g.hidden=!g.querySelector('.chip:not([hidden])')});
  if(all)all.hidden=!!t||open||!list.querySelector('.chip[data-extra="1"]');
  if(none)none.hidden=shown>0;
}
if(all)all.addEventListener('click',function(){list.setAttribute('data-open','1');apply()});
if(find)find.addEventListener('input',apply);
apply();

// the bar of the phone leaves while the button of the top or the form is on screen (it would repeat them)
var bar=doc.getElementById('bar'),box=doc.getElementById('falar'),top=doc.querySelector('.actions');
if(bar&&box&&'IntersectionObserver' in window){
  var seen={};
  var io=new IntersectionObserver(function(es){es.forEach(function(e){seen[e.target.id||'top']=e.isIntersecting});bar.classList.toggle('off',!!(seen.falar||seen.top))});
  io.observe(box);if(top)io.observe(top);
}

// the phone as the person types: (11) 99999-9999
function mask(v){var d=String(v).replace(/\\D/g,'');if(d.length>11&&d.indexOf('55')===0)d=d.slice(2);d=d.slice(0,11);
  if(!d.length)return '';if(d.length<3)return '('+d;if(d.length<7)return '('+d.slice(0,2)+') '+d.slice(2);
  if(d.length<11)return '('+d.slice(0,2)+') '+d.slice(2,6)+(d.length>6?'-'+d.slice(6):'');return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7)}
var phone=f.elements.phone;phone.addEventListener('input',function(){var p=mask(phone.value);if(p!==phone.value)phone.value=p});

function setErr(el,msg){var s=doc.getElementById('e-'+el.name);if(!s)return;s.textContent=msg||'';if(msg)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid')}
function check(){
  var bad=null,n=f.elements.name,p=f.elements.phone,c=f.elements.consent;
  var okN=n.value.trim().length>=2;setErr(n,okN?'':'Informe o seu nome.');if(!okN&&!bad)bad=n;
  var dg=p.value.replace(/\\D/g,'');if(dg.length>11&&dg.indexOf('55')===0)dg=dg.slice(2);
  var okP=dg.length===10||dg.length===11;setErr(p,okP?'':'Informe o WhatsApp com DDD.');if(!okP&&!bad)bad=p;
  setErr(c,c.checked?'':'Aceite o contato para continuar.');if(!c.checked&&!bad)bad=c;
  return bad;
}
f.elements.name.addEventListener('blur',function(){if(this.value)check()});

var er=doc.getElementById('er'),btn=doc.getElementById('b'),label=btn.textContent;
f.addEventListener('submit',function(e){
  e.preventDefault();er.hidden=true;er.textContent='';
  var bad=check();if(bad){bad.focus();return}
  var d={};new FormData(f).forEach(function(v,k){d[k]=v});d.consent=f.consent.checked;
  ['utm_source','utm_medium','utm_campaign'].forEach(function(k){if(q.get(k))d[k]=q.get(k)});
  btn.disabled=true;btn.textContent='Enviando…';
  fetch(location.pathname.replace(/\\/$/,'')+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
  .then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})})
  .then(function(r){
    if(r.s<300){
      var first=String(d.name||'').trim().split(/\\s+/)[0];
      var t=doc.getElementById('doneT');t.textContent=first?'Recebemos seus dados, '+first+'!':'Recebemos seus dados!';
      doc.getElementById('doneM').textContent=r.j.message||'';
      f.hidden=true;var done=doc.getElementById('done');done.hidden=false;t.focus();done.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center'});
    }else{er.textContent=r.j.error||'Não foi possível enviar. Tente de novo.';er.hidden=false;btn.disabled=false;btn.textContent=label;er.focus()}
  })
  .catch(function(){er.textContent='Falha de conexão. Confira a internet e tente de novo.';er.hidden=false;btn.disabled=false;btn.textContent=label;er.focus()});
});
})();
`;

export const renderLeadPage = (o: LeadPageOptions): string => {
  const color = safeColor(o.color);
  const nonce = esc(o.nonce);
  const base = (o.baseUrl || "").replace(/\/$/, "");
  const opt = (arr: string[]) => arr.map(v => `<option>${esc(v)}</option>`).join("");
  const referrer = o.referrer ? esc(o.referrer) : "";

  // the courses by modality (EAD and blended first); the first ones show, the rest comes with "show all" or the search
  const groups = new Map<string, Course[]>();
  o.courses.forEach(c => {
    const key = c.modality && MODALITY_ORDER.includes(c.modality) ? c.modality : c.modality || "Outras";
    groups.set(key, [...(groups.get(key) || []), c]);
  });
  const ordered = [...groups.entries()].sort((a, b) => {
    const ia = MODALITY_ORDER.indexOf(a[0]);
    const ib = MODALITY_ORDER.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const courseGroups = ordered
    .map(([mod, list]) => `<div class="group"><h3>${esc(mod)}${MODALITY_NOTE[mod] ? `<small>${esc(MODALITY_NOTE[mod])}</small>` : ""}</h3>
<div class="chips">${list.map((c, i) => `<button type="button" class="chip" data-course="${c.id}"${i >= COURSES_SHOWN ? ' data-extra="1"' : ""}>${esc(c.name)}</button>`).join("")}</div></div>`)
    .join("");
  const total = o.courses.length;

  const customTitle = o.customTitle ? esc(o.title) : "";
  const headline = customTitle || "Estude no seu ritmo, com a tutoria ao seu lado";
  const pageTitle = o.customTitle ? o.title : "Graduação a distância e semipresencial";
  const fullTitle = `${esc(pageTitle)} · Cruzeiro do Sul Virtual`;
  const description = `${o.referrer ? `Indicação de ${esc(o.referrer)}. ` : ""}Cursos de graduação a distância (EAD) e semipresenciais, com tutoria depois da matrícula. Fale com um consultor pelo WhatsApp.`;
  const privacy = o.privacyUrl && /^https:\/\/[^\s"'<>]+$/.test(o.privacyUrl) ? `<a href="${esc(o.privacyUrl)}" rel="noopener" target="_blank">Aviso de privacidade</a>` : "";
  const favicon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><path d="M32 12l5.5 13.6 14.5 1.1-11.1 9.4 3.5 14.2L32 42.4 19.6 50.3l3.5-14.2L12 26.7l14.5-1.1z" fill="#fff"/></svg>`)}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Cruzeiro do Sul Virtual">
<meta property="og:title" content="${o.referrer ? `Indicação de ${referrer}: ` : ""}${fullTitle}">
<meta property="og:description" content="Cursos EAD e semipresenciais, com tutoria ao seu lado. Deixe o seu contato e converse com um consultor.">
<meta property="og:image" content="${base}/leadform/_og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${favicon}">
<style nonce="${nonce}">${CSS(color)}</style>
</head>
<body>
<a class="skip" href="#falar">Ir para o formulário</a>
<header class="nav"><div class="wrap">
  <img class="logo logo-light" src="/leadform/_logo.svg" width="153" height="36" alt="Cruzeiro do Sul Virtual">
  <img class="logo logo-dark" src="/leadform/_logo-light.png" width="153" height="36" alt="" aria-hidden="true">
  <a class="btn btn-sm" href="#falar">Falar com consultor</a>
</div></header>

<main>
<section class="hero" aria-labelledby="t"><div class="wrap">
  <div class="hero-copy">
    ${o.referrer ? `<div class="ref">Indicação de ${referrer}</div>` : ""}
    <p class="eyebrow">Graduação EAD e semipresencial</p>
    <h1 id="t">${headline}</h1>
    <p class="lede">Cursos de graduação a distância e semipresenciais. Depois da matrícula, a tutoria acompanha você nos primeiros passos e durante o curso.</p>
    <div class="actions">
      <a class="btn" href="#falar">Quero falar com um consultor</a>
      ${courseGroups ? `<a class="link" href="#cursos">Ver os cursos</a>` : ""}
    </div>
    <ul class="facts"><li>100% online no EAD</li><li>Semipresencial com polo</li><li>Tutoria após a matrícula</li></ul>
  </div>
  <figure class="media"><img src="/leadform/_aluna.webp" width="760" height="425" alt="Estudante formada sorrindo, segurando o diploma" fetchpriority="high" decoding="async"></figure>
</div></section>

<section class="section alt" aria-labelledby="porque"><div class="wrap">
  <h2 id="porque">Por que estudar com a gente</h2>
  <p class="sub">Você escolhe o formato que cabe na sua rotina e não fica sozinho depois de começar.</p>
  <div class="cards">
    <div class="card"><div class="ic">${ICON.screen}</div><h3>Estude onde e quando puder</h3><p>No EAD as aulas são online. No semipresencial, você combina a plataforma com encontros no polo.</p></div>
    <div class="card"><div class="ic">${ICON.people}</div><h3>Tutoria ao seu lado</h3><p>Depois da matrícula, a tutoria recebe você, orienta o primeiro acesso e acompanha o curso.</p></div>
    <div class="card"><div class="ic">${ICON.chat}</div><h3>Atendimento pelo WhatsApp</h3><p>Um consultor tira as dúvidas e ajuda a escolher o curso e o formato certos para você.</p></div>
  </div>
</div></section>

${courseGroups ? `<section class="section" id="cursos" aria-labelledby="cursosT"><div class="wrap">
  <h2 id="cursosT">Cursos que você pode fazer</h2>
  <p class="sub">Toque no curso que mais interessa e já deixe o seu contato: o consultor explica o formato e as condições.</p>
  <div class="find"><label class="sr" for="find">Buscar curso</label>${ICON.search}<input id="find" type="search" placeholder="Buscar curso" autocomplete="off" enterkeyhint="search"></div>
  <div id="courses" data-open="0">${courseGroups}</div>
  <p id="none" class="empty" hidden>Nenhum curso com esse nome. Escolha “Ainda não sei” no formulário e o consultor ajuda.</p>
  ${total > COURSES_SHOWN ? `<button type="button" class="link more" id="showAll">Ver todos os ${total} cursos</button>` : ""}
</div></section>` : ""}

<section class="section alt" aria-labelledby="como"><div class="wrap">
  <h2 id="como">Como funciona</h2>
  <p class="sub">Do primeiro contato à primeira aula, em três passos.</p>
  <ol class="steps">
    <li class="step"><b aria-hidden="true">1</b><h3>Deixe seus dados</h3><p>Leva menos de um minuto. Só nome e WhatsApp são obrigatórios.</p></li>
    <li class="step"><b aria-hidden="true">2</b><h3>Um consultor chama você</h3><p>Pelo WhatsApp, para tirar as dúvidas e ajudar a escolher curso e formato.</p></li>
    <li class="step"><b aria-hidden="true">3</b><h3>Matrícula e tutoria</h3><p>Depois de matriculado, a tutoria acompanha você nos primeiros passos e ao longo do curso.</p></li>
  </ol>
</div></section>

<section class="section"><div class="wrap">
  <div class="tutor"><div class="ic">${ICON.cap}</div>
  <div><h2>Você não estuda sozinho</h2><p>Depois da matrícula, a tutoria faz a sua recepção, orienta o acesso à plataforma e continua por perto: se bater uma dúvida ou o ritmo apertar, tem alguém para ajudar você a seguir em frente.</p></div></div>
</div></section>

<section class="section alt" id="falar" aria-labelledby="falarT"><div class="wrap">
  <div class="formbox">
    <div class="side">
      <h2 id="falarT">Fale com um consultor</h2>
      <p>Conte um pouco sobre você e escolha o curso. Retornamos pelo WhatsApp.</p>
      <ul><li>Sem compromisso para conversar</li><li>Explicamos o formato EAD e o semipresencial</li><li>Mostramos como é a tutoria depois da matrícula</li></ul>
    </div>
    <div>
      <form id="f" novalidate>
        <div class="field"><label for="name">Nome completo</label><input id="name" name="name" required autocomplete="name" aria-describedby="e-name"><span class="err-t" id="e-name" role="alert"></span></div>
        <div class="field"><label for="phone">WhatsApp com DDD</label><input id="phone" name="phone" required type="tel" inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" aria-describedby="e-phone"><span class="err-t" id="e-phone" role="alert"></span></div>
        <div class="field"><label for="course">Curso de interesse</label><select id="course" name="courseId"><option value="">Ainda não sei</option>${o.courses.map(c => `<option value="${c.id}">${esc(c.name)}${c.modality ? ` · ${esc(c.modality)}` : ""}</option>`).join("")}</select></div>
        <details class="more-fields"><summary>Quer detalhar? (opcional)</summary><div class="in">
          <div class="row"><div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email"></div><div class="field"><label for="city">Cidade</label><input id="city" name="city" autocomplete="address-level2"></div></div>
          <div class="row"><div class="field"><label for="modality">Modalidade</label><select id="modality" name="modality"><option value="">Selecione</option>${opt(CRM_OPTIONS.modalities)}</select></div>
          <div class="field"><label for="admissionType">Forma de ingresso</label><select id="admissionType" name="admissionType"><option value="">Selecione</option>${opt(CRM_OPTIONS.admissionTypes)}</select></div></div>
        </div></details>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="field"><label class="consent" for="consent"><input type="checkbox" id="consent" name="consent" required aria-describedby="e-consent"><span>Concordo em receber contato por WhatsApp, e-mail ou telefone sobre cursos, conforme a LGPD.</span></label><span class="err-t" id="e-consent" role="alert"></span></div>
        <div id="er" class="msg" role="alert" tabindex="-1" hidden></div>
        <button class="btn btn-block" id="b" type="submit">Quero falar com um consultor</button>
        <p class="safe">Seus dados são usados só para o contato sobre cursos.</p>
      </form>
      <div class="done" id="done" hidden><div class="ok">${ICON.check}</div>
        <h3 id="doneT" tabindex="-1">Recebemos seus dados!</h3><p id="doneM"></p><p><b>Fique de olho no WhatsApp:</b> um consultor vai chamar você em breve.</p></div>
    </div>
  </div>
</div></section>

<section class="section" aria-labelledby="duvidas"><div class="wrap">
  <h2 id="duvidas">Dúvidas comuns</h2><p class="sub">Respostas rápidas antes de falar com o consultor.</p>
  <div class="faq-list">
    <details><summary>Preciso ir até um polo?</summary><p>No EAD as aulas são online. No semipresencial, parte das atividades é presencial no polo. O consultor explica o formato de cada curso.</p></details>
    <details><summary>Quanto custa?</summary><p>Os valores e as condições variam conforme o curso e a forma de ingresso. O consultor apresenta tudo na conversa, sem compromisso.</p></details>
    <details><summary>Tem apoio depois da matrícula?</summary><p>Sim. A tutoria acompanha você nos primeiros passos e durante o curso, para ajudar com acesso, dúvidas e rotina de estudos.</p></details>
    <details><summary>Posso trocar de ideia depois de conversar?</summary><p>Pode. A conversa é para você entender as opções e decidir com calma.</p></details>
  </div>
</div></section>
</main>

<footer><div class="wrap">Cruzeiro do Sul Virtual · Educação a distância${privacy ? ` · ${privacy}` : ""}</div></footer>
<div class="bar" id="bar"><a class="btn btn-block" href="#falar">Falar com um consultor</a></div>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
};

// A link that is not available (a wrong code, a paused affiliate, a form that was turned off): the same answer for all of them, with the brand and a way
// back, instead of a line of plain text.
export const renderUnavailable = (nonce: string, color: string, text: string): string => {
  const c = safeColor(color);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link indisponível · Cruzeiro do Sul Virtual</title>
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<style nonce="${esc(nonce)}">:root{color-scheme:light dark;--bg:#fff;--label:#1d1d1f;--label2:#6e6e73;--tint:${c}}@media(prefers-color-scheme:dark){:root{--bg:#000;--label:#f5f5f7;--label2:#a1a1a6}}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--label);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;font-size:17px;line-height:1.47;text-align:center}
main{max-width:420px}.ic{width:64px;height:64px;border-radius:20px;background:var(--tint);color:#fff;display:grid;place-items:center;margin:0 auto 20px;font-size:30px;font-weight:700}
h1{margin:0 0 8px;font-size:28px;letter-spacing:-.02em}p{margin:0;color:var(--label2)}</style></head>
<body><main><div class="ic" aria-hidden="true">!</div><h1>Link indisponível</h1><p>${esc(text)}</p></main></body></html>`;
};
