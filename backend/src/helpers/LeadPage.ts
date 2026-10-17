import Course from "../models/Course";
import { logoBytes } from "../services/MailServices/Logo";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";

// The public page of capture (the form of the site and the link of an affiliate): who we are, what we offer (distance learning
// and blended courses), the tutoring after the enrollment, the steps, the courses and the form. It never shows a price or
// promises a result: it invites the person to talk to a consultant. One file of HTML, no libraries, fast on a phone.
const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// the student of the page: a photo with the background taken out (served by the same server, cached by the browser)
const STUDENT = `<img src="/leadform/_aluna.webp" width="760" height="425" alt="Estudante formada sorrindo, segurando o diploma" loading="eager" decoding="async">`;

const MODALITY_ORDER = ["EAD", "Semipresencial", "Flex", "Presencial"];
const MODALITY_NOTE: Record<string, string> = {
  EAD: "Aulas online, no seu horário",
  Semipresencial: "Aulas online e encontros no polo"
};

export interface LeadPageOptions {
  title: string;
  color: string;
  courses: Course[];
  // who sent the person here (the first name of the affiliate), when there is one
  referrer?: string;
  // the title the administration chose for the form; the default one is replaced by the headline of the page
  customTitle?: boolean;
  thanks?: string;
}

export const renderLeadPage = (o: LeadPageOptions): string => {
  const color = /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#0B4279";
  const opt = (arr: string[]) => arr.map(v => `<option>${esc(v)}</option>`).join("");
  const logo = logoBytes();
  const logoTag = logo
    ? `<img class="logo" src="data:image/png;base64,${logo.toString("base64")}" width="276" height="65" alt="Cruzeiro do Sul Virtual">`
    : `<strong class="logo-text">Cruzeiro do Sul Virtual</strong>`;

  // the courses by modality (EAD and blended first), each one a button that picks it in the form
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
    .map(([mod, list]) => {
      const shown = list.slice(0, 14);
      return `<div class="group"><h3>${esc(mod)}${MODALITY_NOTE[mod] ? `<small>${esc(MODALITY_NOTE[mod])}</small>` : ""}</h3>
<div class="chips">${shown.map(c => `<button type="button" class="chip" data-course="${c.id}">${esc(c.name)}</button>`).join("")}${list.length > shown.length ? `<span class="more">+ ${list.length - shown.length} cursos</span>` : ""}</div></div>`;
    })
    .join("");

  const headline = o.customTitle ? esc(o.title) : "Estude no seu ritmo, com a tutoria ao seu lado";
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title>
<meta name="description" content="Cursos de graduação a distância (EAD) e semipresenciais, com tutoria depois da matrícula. Fale com um consultor.">
<style>
:root{--c:${color};--b:#0693E3;--y:#FEF84C;--ink:#0b1a2e;--mut:#5d6f86;--line:#e2e8f0}
*{box-sizing:border-box}html{scroll-behavior:smooth;overflow-x:hidden;-webkit-text-size-adjust:100%}
body{margin:0;font-family:Geist,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#f6f8fb;line-height:1.5;overflow-x:hidden;max-width:100vw;overscroll-behavior-x:none}
img,svg{max-width:100%}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.hero{background:radial-gradient(ellipse 85% 38% at 72% 100%,rgba(255,176,120,.55),rgba(255,120,160,.22) 55%,rgba(255,120,160,0) 78%),linear-gradient(135deg,#08213f 0%,var(--c) 45%,var(--b) 100%);color:#fff;position:relative;overflow:hidden;overflow:clip}
.hero:before{content:"";position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28),rgba(255,255,255,0) 68%)}
.hero .wrap{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:end;padding-top:26px}
.hero-copy{padding:18px 0 54px}
.logo{display:block;width:230px;height:auto;margin-bottom:34px}.logo-text{display:block;margin-bottom:34px;font-size:20px}
.eyebrow{display:inline-flex;gap:8px;align-items:center;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22);padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;margin-bottom:16px}
.eyebrow i{width:8px;height:8px;border-radius:50%;background:var(--y);display:inline-block}
h1{font-size:clamp(30px,5vw,52px);line-height:1.06;letter-spacing:-.03em;margin:0 0 16px;font-weight:800}
h1 mark{background:none;color:var(--y);padding:0}
.lead{font-size:clamp(16px,2vw,19px);max-width:540px;color:rgba(255,255,255,.9);margin:0 0 22px}
.ref{display:inline-block;background:var(--y);color:#0b1a2e;font-weight:700;font-size:13px;padding:5px 12px;border-radius:999px;margin:0 0 18px}
.cta{display:inline-flex;align-items:center;gap:10px;background:var(--y);color:#0b1a2e;font-weight:800;text-decoration:none;padding:15px 26px;border-radius:14px;font-size:17px;box-shadow:0 14px 30px -14px rgba(0,0,0,.55);transition:transform .15s}
.cta:hover{transform:translateY(-2px)}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}.pills span{background:rgba(255,255,255,.14);padding:6px 13px;border-radius:999px;font-size:13.5px;font-weight:600}
.student{position:relative;-webkit-mask-image:linear-gradient(to right,transparent 0,#000 20%,#000 100%),linear-gradient(to top,transparent 0,#000 6%,#000 100%);-webkit-mask-composite:source-in;mask-image:linear-gradient(to right,transparent 0,#000 20%,#000 100%),linear-gradient(to top,transparent 0,#000 6%,#000 100%);mask-composite:intersect;align-self:end;justify-self:end;width:min(135%,760px);margin:0 -30px -4px 0}
.student img{display:block;width:100%;height:auto}
.student:after{content:"";position:absolute;left:0;right:0;bottom:0;height:46%;pointer-events:none;background:linear-gradient(to top,rgba(255,170,120,.62) 0,rgba(255,120,160,.28) 40%,rgba(255,120,160,0) 100%);mix-blend-mode:soft-light}
.section{padding:54px 0}
.section h2{font-size:clamp(24px,3.4vw,34px);letter-spacing:-.02em;margin:0 0 8px}
.section .sub{color:var(--mut);margin:0 0 26px;max-width:620px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 14px 30px -24px rgba(11,66,121,.45)}
.card .ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(6,147,227,.12);color:var(--c);margin-bottom:12px}
.card h3{margin:0 0 6px;font-size:18px}.card p{margin:0;color:var(--mut);font-size:15px}
.group{margin-bottom:20px}.group h3{margin:0 0 10px;font-size:17px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.group h3 small{font-size:13px;font-weight:500;color:var(--mut)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{font:inherit;font-size:14.5px;font-weight:600;padding:9px 16px;border-radius:999px;border:1.5px solid #cfe0f3;background:#fff;color:var(--c);cursor:pointer;transition:all .15s}
.chip:hover{border-color:var(--b);background:#eef6fe;transform:translateY(-1px)}
.more{align-self:center;color:var(--mut);font-size:13.5px;padding:0 6px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;counter-reset:s}
.step{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;position:relative}
.step b{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--c);color:#fff;font-size:16px;margin-bottom:10px}
.step h3{margin:0 0 4px;font-size:17px}.step p{margin:0;color:var(--mut);font-size:15px}
.tutor{background:linear-gradient(135deg,#eef6fe,#fff);border:1px solid #cfe0f3;border-radius:22px;padding:28px;display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center}
.tutor .big{width:64px;height:64px;border-radius:20px;background:var(--c);color:#fff;display:grid;place-items:center}
.tutor h2{margin:0 0 6px;font-size:26px}.tutor p{margin:0;color:var(--mut);max-width:680px}
.formbox{background:linear-gradient(135deg,#08213f,var(--c));color:#fff;border-radius:26px;padding:34px;display:grid;grid-template-columns:.9fr 1.1fr;gap:30px;align-items:start}
.formbox h2{margin:0 0 8px;font-size:clamp(24px,3.4vw,34px);letter-spacing:-.02em}.formbox .side p{color:rgba(255,255,255,.88);margin:0 0 14px}
.formbox ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}.formbox li{display:flex;gap:10px;align-items:flex-start;font-size:15px}.formbox li:before{content:"";flex:none;width:20px;height:20px;margin-top:1px;border-radius:50%;background:var(--y) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M5 10.5l3.2 3.2L15 7' fill='none' stroke='%230b1a2e' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/20px no-repeat}
form{background:#fff;color:var(--ink);border-radius:20px;padding:22px;display:grid;gap:14px;box-shadow:0 24px 50px -24px rgba(0,0,0,.6)}
label{display:grid;gap:6px;font-size:13px;font-weight:600;color:#334155}
input,select{font:inherit;font-size:16px;padding:12px 13px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:inherit;width:100%}
input:focus,select:focus{outline:none;border-color:var(--b);box-shadow:0 0 0 3px rgba(6,147,227,.2)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
details{border:1px dashed #cbd5e1;border-radius:12px;padding:10px 12px}summary{cursor:pointer;font-size:13.5px;font-weight:600;color:var(--c)}details[open] summary{margin-bottom:12px}details .in{display:grid;gap:12px}
.consent{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:12.5px;color:var(--mut)}.consent input{width:auto;margin-top:2px}
button.send{font:inherit;font-weight:800;font-size:17px;padding:15px;border:0;border-radius:12px;background:var(--c);color:#fff;cursor:pointer;transition:transform .15s,filter .15s}
button.send:hover{filter:brightness(1.12)}button.send:active{transform:scale(.98)}button.send:disabled{opacity:.6;cursor:default}
.hp{position:absolute;left:-9999px}.msg{padding:14px;border-radius:10px;font-size:14px;display:none}.err{background:#fee2e2;color:#7f1d1d}
.safe{font-size:12.5px;color:var(--mut);text-align:center;margin:0}
.done{display:none;background:#fff;color:var(--ink);border-radius:20px;padding:28px;text-align:center;box-shadow:0 24px 50px -24px rgba(0,0,0,.6)}
.done .ok{width:62px;height:62px;border-radius:50%;background:#dcfce7;color:#15803d;display:grid;place-items:center;margin:0 auto 12px}.done h3{margin:0 0 6px;font-size:22px}.done p{margin:0 0 8px;color:var(--mut)}
.faq details{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:10px}.faq summary{font-size:16px;color:var(--ink)}.faq p{margin:0;color:var(--mut)}
footer{padding:30px 0 90px;color:var(--mut);font-size:13px;text-align:center}
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:5;padding:10px 14px;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-top:1px solid var(--line);display:none}
.sticky a{display:block;text-align:center;text-decoration:none;background:var(--c);color:#fff;font-weight:800;padding:14px;border-radius:12px}
@media(max-width:860px){.hero .wrap{grid-template-columns:1fr}.student{width:calc(100% + 40px);max-width:none;margin:-6px -20px -4px -20px}.hero-copy{padding-bottom:10px}.cards,.steps{grid-template-columns:1fr}.formbox{grid-template-columns:1fr;padding:22px}.tutor{grid-template-columns:1fr}.sticky{display:block}.sticky.off{display:none}}
@media(max-width:480px){.row{grid-template-columns:1fr}.logo{width:190px;margin-bottom:24px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
</style>
<body>
<header class="hero"><div class="wrap">
  <div class="hero-copy">
    ${logoTag}
    <span class="eyebrow"><i></i> EAD e semipresencial</span>
    ${o.referrer ? `<div class="ref">Indicação de ${esc(o.referrer)}</div>` : ""}
    <h1>${o.customTitle ? headline : `Estude no seu ritmo, com a <mark>tutoria</mark> ao seu lado`}</h1>
    <p class="lead">Cursos de graduação a distância e semipresenciais. Depois da matrícula, a tutoria acompanha você nos primeiros passos e durante o curso.</p>
    <a class="cta" href="#falar">Quero falar com um consultor <span aria-hidden="true">→</span></a>
    <div class="pills"><span>100% online no EAD</span><span>Semipresencial com polo</span><span>Tutoria após a matrícula</span></div>
  </div>
  <div class="student">${STUDENT}</div>
</div></header>

<main>
<section class="section"><div class="wrap">
  <h2>Por que estudar com a gente</h2>
  <p class="sub">Você escolhe o formato que cabe na sua rotina e não fica sozinho depois de começar.</p>
  <div class="cards">
    <div class="card"><div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></div><h3>EAD ou semipresencial</h3><p>No EAD você assiste e estuda online, no seu horário. No semipresencial, une as aulas online a encontros no polo.</p></div>
    <div class="card"><div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 11l2 2 4-4"/></svg></div><h3>Tutoria depois da matrícula</h3><p>Uma equipe de tutoria recebe você, ajuda no primeiro acesso e acompanha o seu caminho no curso.</p></div>
    <div class="card"><div class="ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg></div><h3>Atendimento de gente de verdade</h3><p>Um consultor conversa com você pelo WhatsApp, tira as dúvidas e explica cada etapa, sem compromisso.</p></div>
  </div>
</div></section>

${courseGroups ? `<section class="section" style="padding-top:0"><div class="wrap">
  <h2>Cursos que você pode fazer</h2>
  <p class="sub">Toque no curso que mais interessa e já deixe o seu contato: o consultor explica o formato e as condições.</p>
  ${courseGroups}
</div></section>` : ""}

<section class="section" style="padding-top:0"><div class="wrap">
  <h2>Como funciona</h2>
  <p class="sub">Do primeiro contato à primeira aula, em três passos.</p>
  <div class="steps">
    <div class="step"><b>1</b><h3>Deixe seus dados</h3><p>Leva menos de um minuto. Só nome e WhatsApp são obrigatórios.</p></div>
    <div class="step"><b>2</b><h3>Um consultor chama você</h3><p>Pelo WhatsApp, para tirar as dúvidas e ajudar a escolher curso e formato.</p></div>
    <div class="step"><b>3</b><h3>Matrícula e tutoria</h3><p>Depois de matriculado, a tutoria acompanha você nos primeiros passos e ao longo do curso.</p></div>
  </div>
</div></section>

<section class="section" style="padding-top:0"><div class="wrap">
  <div class="tutor"><div class="big"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/></svg></div>
  <div><h2>Você não estuda sozinho</h2><p>Depois da matrícula, a tutoria faz a sua recepção, orienta o acesso à plataforma e continua por perto: se bater uma dúvida ou o ritmo apertar, tem alguém para ajudar você a seguir em frente.</p></div></div>
</div></section>

<section class="section" id="falar" style="padding-top:0"><div class="wrap">
  <div class="formbox">
    <div class="side">
      <h2>Fale com um consultor</h2>
      <p>Conte um pouco sobre você e escolha o curso. Retornamos pelo WhatsApp.</p>
      <ul><li>Sem compromisso para conversar</li><li>Explicamos o formato EAD e o semipresencial</li><li>Mostramos como é a tutoria depois da matrícula</li></ul>
    </div>
    <div>
      <form id="f" novalidate>
        <label>Nome completo<input name="name" required autocomplete="name"></label>
        <label>WhatsApp<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="(11) 99999-0000"></label>
        <label>Curso de interesse<select name="courseId" id="course"><option value="">Escolha um curso</option>${o.courses.map(c => `<option value="${c.id}">${esc(c.name)}${c.modality ? ` · ${esc(c.modality)}` : ""}</option>`).join("")}</select></label>
        <details><summary>Quer detalhar? (opcional)</summary><div class="in">
          <div class="row"><label>E-mail<input name="email" type="email" autocomplete="email"></label><label>Cidade<input name="city" autocomplete="address-level2"></label></div>
          <div class="row"><label>Modalidade<select name="modality"><option value="">Selecione</option>${opt(CRM_OPTIONS.modalities)}</select></label>
          <label>Forma de ingresso<select name="admissionType"><option value="">Selecione</option>${opt(CRM_OPTIONS.admissionTypes)}</select></label></div>
        </div></details>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <label class="consent"><input type="checkbox" name="consent" required> Concordo em receber contato por WhatsApp, e-mail ou telefone sobre cursos, conforme a LGPD.</label>
        <button class="send" id="b">Quero falar com um consultor</button>
        <div id="er" class="msg err"></div>
        <p class="safe">Seus dados são usados só para o contato sobre cursos.</p>
      </form>
      <div class="done" id="done"><div class="ok"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg></div>
        <h3 id="doneT">Recebemos seus dados!</h3><p id="doneM"></p><p><b>Fique de olho no WhatsApp:</b> um consultor vai chamar você em breve.</p></div>
    </div>
  </div>
</div></section>

<section class="section faq" style="padding-top:0"><div class="wrap">
  <h2>Dúvidas comuns</h2><p class="sub">Respostas rápidas antes de falar com o consultor.</p>
  <details><summary>Preciso ir até um polo?</summary><p>No EAD as aulas são online. No semipresencial, parte das atividades é presencial no polo. O consultor explica o formato de cada curso.</p></details>
  <details><summary>Quanto custa?</summary><p>Os valores e as condições variam conforme o curso e a forma de ingresso. O consultor apresenta tudo na conversa, sem compromisso.</p></details>
  <details><summary>Tem apoio depois da matrícula?</summary><p>Sim. A tutoria acompanha você nos primeiros passos e durante o curso, para ajudar com acesso, dúvidas e rotina de estudos.</p></details>
  <details><summary>Posso trocar de ideia depois de conversar?</summary><p>Pode. A conversa é para você entender as opções e decidir com calma.</p></details>
</div></section>
</main>

<footer><div class="wrap">Cruzeiro do Sul Virtual · Educação a distância</div></footer>
<div class="sticky" id="sticky"><a href="#falar">Falar com um consultor</a></div>
<script>
var q=new URLSearchParams(location.search);
var course=document.getElementById('course');
function pick(id){course.value=String(id);document.getElementById('falar').scrollIntoView({behavior:'smooth'});setTimeout(function(){var n=document.querySelector('input[name=name]');if(n)n.focus({preventScroll:true})},500)}
Array.prototype.forEach.call(document.querySelectorAll('[data-course]'),function(b){b.addEventListener('click',function(){pick(b.getAttribute('data-course'))})});
if(q.get('curso')&&course.querySelector('option[value="'+q.get('curso')+'"]'))course.value=q.get('curso');
// the bar of the phone leaves when the form is on screen
var st=document.getElementById('sticky');
if('IntersectionObserver' in window){new IntersectionObserver(function(e){st.classList.toggle('off',e[0].isIntersecting)}).observe(document.getElementById('falar'))}
document.getElementById('f').addEventListener('submit',function(e){
  e.preventDefault();var f=e.target,b=document.getElementById('b'),er=document.getElementById('er');
  er.style.display='none';
  var d={};new FormData(f).forEach(function(v,k){d[k]=v});d.consent=f.consent.checked;
  ['utm_source','utm_medium','utm_campaign'].forEach(function(k){if(q.get(k))d[k]=q.get(k)});
  b.disabled=true;b.textContent='Enviando...';
  fetch(location.pathname.replace(/\\/$/,'')+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
  .then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})})
  .then(function(r){
    if(r.s<300){var first=String(d.name||'').trim().split(/\\s+/)[0];document.getElementById('doneT').textContent=first?'Recebemos seus dados, '+first+'!':'Recebemos seus dados!';document.getElementById('doneM').textContent=r.j.message||'';f.style.display='none';document.getElementById('done').style.display='block';document.getElementById('done').scrollIntoView({behavior:'smooth',block:'center'});}
    else{er.textContent=r.j.error||'Não foi possível enviar.';er.style.display='block';b.disabled=false;b.textContent='Quero falar com um consultor'}
  })
  .catch(function(){er.textContent='Falha de conexão. Tente de novo.';er.style.display='block';b.disabled=false;b.textContent='Quero falar com um consultor'});
});
</script></html>`;
};
