import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import SiteShell, { useMeta } from "./Shell";
import { SITE, contactHref } from "./config";
import { InstagramBrand, MessengerBrand, TelegramBrand, WhatsAppBrand } from "../../icons/brands";
import inbox from "../../assets/site/inbox.webp";
import crm from "../../assets/site/crm.webp";
import agent from "../../assets/site/agent.webp";
import flows from "../../assets/site/flows.webp";

// The look of the page: a dark hero with moving fibres, a floating glass header, a bento of cards that light up under the mouse and show small animated
// scenes, numbers that count up, a sticky "how it works" panel, a carousel and an accordion. Everything moves only when the person did not ask the system
// for reduced motion. Nothing here is a claim the product cannot keep: no invented clients, numbers, prices or testimonials.

const css = `
:root{--t:#14b8a6;--t2:#0f9d92;--ink:#06202b;--ink2:#0b3340}
.sl h1,.sl h2,.sl h3{font-family:"Geist","Raleway",system-ui,sans-serif}
.sl-rv{opacity:0;transform:translateY(28px);transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.sl-rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){.sl-rv{opacity:1;transform:none;transition:none}.sl *{animation:none!important}}
/* hero */
.sl-hero{position:relative;overflow:hidden;background:#04141b;color:#fff;padding:168px 24px 70px}
.sl-hero::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 55% at 78% 62%,rgba(20,184,166,.5),transparent 70%),radial-gradient(45% 45% at 18% 8%,rgba(15,157,146,.22),transparent 70%),linear-gradient(90deg,rgba(4,20,27,.92),rgba(4,20,27,.45) 45%,rgba(4,20,27,.1))}
.sl-fibres{position:absolute;inset:-10% -10% 0 -10%;opacity:.85;animation:sl-drift 26s ease-in-out infinite alternate;pointer-events:none}
@keyframes sl-drift{from{transform:translate3d(-2%,0,0) rotate(-1.2deg)}to{transform:translate3d(3%,-2%,0) rotate(1.4deg)}}
.sl-hero-in{position:relative;z-index:2;max-width:980px;margin:0 auto;text-align:center}
.sl-h1{font-size:clamp(34px,5.2vw,62px);line-height:1.06;letter-spacing:-.035em;font-weight:700;margin:0;background:linear-gradient(92deg,#fff 0%,#fff 48%,#a7f0e2 78%,#6ee7d3 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sl-lead{font-size:clamp(17px,2vw,20px);line-height:1.6;color:rgba(255,255,255,.82);max-width:720px;margin:24px auto 0}
.sl-cta{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:36px}
.sl-cta .st-btn{padding:16px 30px;font-size:17px;border-radius:14px}
.sl-ghost{background:rgba(255,255,255,.06);border:1.5px solid #fff;color:#fff!important}
.sl-ghost:hover{background:rgba(255,255,255,.14);transform:translateY(-2px)}
.sl-trust{display:flex;gap:10px 24px;justify-content:center;flex-wrap:wrap;margin-top:22px;font-size:14px;color:rgba(255,255,255,.7)}
.sl-trust span::before{content:"✓";margin-right:7px;color:#5eead4;font-weight:700}
.sl-marq{position:relative;z-index:2;margin:64px auto 0;max-width:1180px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}
.sl-track{display:flex;align-items:center;gap:56px;width:max-content;animation:sl-marq 34s linear infinite}
@keyframes sl-marq{to{transform:translateX(-50%)}}
.sl-chip{display:inline-flex;align-items:center;gap:10px;font-size:19px;font-weight:600;color:rgba(255,255,255,.9);white-space:nowrap}
.sl-chip svg{filter:brightness(0) invert(1);opacity:.9}
/* sections */
.sl-sec{padding:96px 24px;position:relative}
.sl-wrap{max-width:1180px;margin:0 auto;position:relative}
.sl-eb{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t2)}
.sl-h2{font-size:clamp(28px,3.8vw,42px);line-height:1.1;letter-spacing:-.025em;font-weight:700;margin:12px 0 0;max-width:760px}
.sl-sub{font-size:18px;color:#4a5b70;line-height:1.6;margin:16px 0 0;max-width:660px}
.sl-center{text-align:center}.sl-center .sl-h2,.sl-center .sl-sub{margin-left:auto;margin-right:auto}
/* bento */
.sl-bento{display:grid;grid-template-columns:repeat(12,1fr);gap:20px;margin-top:52px}
.sl-card{position:relative;overflow:hidden;border-radius:24px;padding:30px;border:1px solid #e4e9f0;background:#fff;display:flex;flex-direction:column;min-height:430px;transition:transform .34s cubic-bezier(.2,.7,.2,1),box-shadow .34s,border-color .34s}
.sl-card:hover{transform:translateY(-4px);box-shadow:0 26px 50px -30px rgba(6,32,43,.45)}
.sl-card::before,.sl-card::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s}
.sl-card::before{background:radial-gradient(420px circle at var(--mx,50%) var(--my,0%),rgba(20,184,166,.14),transparent 60%)}
.sl-card::after{padding:1px;background:radial-gradient(340px circle at var(--mx,50%) var(--my,0%),rgba(20,184,166,.7),transparent 55%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.sl-card:hover::before,.sl-card:hover::after{opacity:1}
.sl-card.teal{background:#0f9d92;border-color:#0f9d92;color:#fff}
.sl-card.dark{background:#06202b;border-color:#06202b;color:#fff}
.sl-card.teal::before,.sl-card.dark::before{background:radial-gradient(420px circle at var(--mx,50%) var(--my,0%),rgba(255,255,255,.14),transparent 60%)}
.sl-card.teal::after,.sl-card.dark::after{background:radial-gradient(340px circle at var(--mx,50%) var(--my,0%),rgba(255,255,255,.55),transparent 55%)}
.sl-card h3{font-size:22px;line-height:1.22;letter-spacing:-.01em;margin:0;position:relative;z-index:1;max-width:420px}
.sl-card p.d{font-size:15px;line-height:1.55;margin:10px 0 0;opacity:.8;position:relative;z-index:1;max-width:420px}
.sl-stage{position:relative;z-index:1;margin-top:20px;flex:1 1 auto;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
.sl-glass{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2)}
.sl-shot{border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.28);box-shadow:0 18px 40px -20px rgba(0,0,0,.5)}
.sl-shot img{display:block;width:100%;height:auto}
@media(max-width:980px){.sl-bento{grid-template-columns:repeat(6,1fr)}.sl-bento>.sl-card{grid-column:span 6!important}}
/* scenes */
@keyframes sl-in{0%{opacity:0;transform:translateY(14px)}12%,100%{opacity:1;transform:none}}
@keyframes sl-fill{0%{width:8%}55%,100%{width:var(--w,70%)}}
@keyframes sl-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
@keyframes sl-draw{0%{stroke-dashoffset:200}60%,100%{stroke-dashoffset:0}}
@keyframes sl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.sl-msgs{display:flex;flex-direction:column;gap:9px;padding:14px}
.sl-m{max-width:84%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.4;animation:sl-in 9s ease-in-out infinite}
.sl-m.l{background:#fff;color:#0f1d33;border-bottom-left-radius:4px;align-self:flex-start}
.sl-m.r{background:#14b8a6;color:#04201c;border-bottom-right-radius:4px;align-self:flex-end}
.sl-bars{display:flex;flex-direction:column;gap:12px;padding:6px 2px}
.sl-bar{display:grid;grid-template-columns:118px 1fr 34px;align-items:center;gap:10px;font-size:13px;color:#33465b}
.sl-bar i{display:block;height:10px;border-radius:99px;background:#e7f4f2;overflow:hidden}
.sl-bar i b{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#0f9d92,#5eead4);animation:sl-fill 5s ease-in-out infinite;width:var(--w)}
.sl-bar span:last-child{text-align:right;font-weight:700;color:#06202b;font-variant-numeric:tabular-nums}
.sl-route{display:flex;flex-direction:column;gap:10px}
.sl-r{display:flex;align-items:center;gap:11px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:13px;padding:11px 13px;font-size:13px;color:#dbf3ef;animation:sl-in 7s ease-in-out infinite}
.sl-r em{width:26px;height:26px;border-radius:8px;background:#14b8a6;display:grid;place-items:center;font-style:normal;color:#04201c;font-weight:800;font-size:12px;flex:none}
.sl-live{display:inline-flex;align-items:center;gap:8px;color:#5eead4;font-size:13px;font-weight:600}
.sl-live i{width:9px;height:9px;border-radius:50%;background:#5eead4;animation:sl-pulse 1.8s ease-in-out infinite}
.sl-dots{position:absolute;inset:0;pointer-events:none;opacity:.5;background-image:radial-gradient(rgba(20,184,166,.45) 1.2px,transparent 1.6px);background-size:14px 14px;-webkit-mask-image:radial-gradient(120% 90% at 92% 4%,#000,transparent 62%);mask-image:radial-gradient(120% 90% at 92% 4%,#000,transparent 62%);animation:sl-float 9s ease-in-out infinite}
/* stats */
.sl-stats{background:#06202b;color:#fff;padding:84px 24px}
.sl-stats-g{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:32px;text-align:center}
@media(max-width:760px){.sl-stats-g{grid-template-columns:repeat(2,1fr)}}
.sl-num{font-family:"Geist",sans-serif;font-size:clamp(38px,5vw,56px);font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.sl-nl{font-size:15px;color:#9fb7c2;margin-top:6px}
/* how */
.sl-how{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;margin-top:48px}
@media(max-width:900px){.sl-how{grid-template-columns:1fr}.sl-how-l{position:static!important}}
.sl-how-l{position:sticky;top:120px}
.sl-vis{position:relative;height:420px;border-radius:24px;background:linear-gradient(160deg,#eefaf8,#fff);border:1px solid #dcefec;overflow:hidden}
.sl-v{position:absolute;inset:0;padding:30px;opacity:0;transform:translateY(12px);transition:opacity .5s,transform .5s;display:flex;flex-direction:column;gap:12px}
.sl-v.on{opacity:1;transform:none}
.sl-big{font-family:"Geist",sans-serif;font-size:48px;font-weight:700;line-height:1;color:var(--t2)}
.sl-conn{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:6px}
.sl-cn{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e1ece9;border-radius:14px;padding:12px 14px;font-weight:600;font-size:14px}
.sl-cn small{margin-left:auto;font-weight:600;color:#15935f;font-size:12px;animation:sl-pulse 2.4s ease-in-out infinite}
.sl-stepc{min-height:58vh;display:flex;align-items:center;opacity:.4;transition:opacity .4s}
.sl-stepc.on{opacity:1}
.sl-stepc>div{display:flex;gap:18px}
.sl-stepc span.bar{width:4px;border-radius:4px;background:#cfe3df;flex:none;transition:background .4s}
.sl-stepc.on span.bar{background:var(--t2)}
.sl-stepc h3{font-size:28px;margin:6px 0 0;letter-spacing:-.01em}
.sl-stepc p{font-size:17px;line-height:1.65;color:#4a5b70;margin:12px 0 0}
.sl-stepc b.k{font-size:13px;letter-spacing:.08em;color:var(--t2)}
/* carousel */
.sl-car{background:linear-gradient(135deg,#e6f7f5,#d3f0ed 50%,#c3ebe7);padding:96px 24px;position:relative;overflow:hidden}
.sl-ctr{display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:26px 4px 30px;scrollbar-width:none}
.sl-ctr::-webkit-scrollbar{display:none}
.sl-cc{flex:0 0 min(420px,86vw);scroll-snap-align:center;background:#fff;border-radius:24px;padding:28px;box-shadow:0 22px 44px -30px rgba(6,32,43,.45);display:flex;flex-direction:column;gap:12px;transition:transform .3s}
.sl-cc:hover{transform:translateY(-4px)}
.sl-cc .tag{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--t2)}
.sl-cc .b{font-size:14.5px;line-height:1.45;padding:10px 13px;border-radius:14px;max-width:88%}
.sl-cc .a{background:#f1f5f9;color:#0f1d33;align-self:flex-start;border-bottom-left-radius:4px}
.sl-cc .z{background:#14b8a6;color:#04201c;align-self:flex-end;border-bottom-right-radius:4px}
.sl-ar{position:absolute;top:52%;width:48px;height:48px;border-radius:50%;background:#fff;border:0;box-shadow:0 10px 26px rgba(6,32,43,.2);cursor:pointer;font-size:22px;color:#06202b;display:grid;place-items:center;z-index:3;transition:transform .2s}
.sl-ar:hover{transform:scale(1.08)}
@media(max-width:640px){.sl-ar{display:none}}
.sl-dotsr{display:flex;justify-content:center;gap:8px;margin-top:4px}
.sl-dt{width:9px;height:9px;border-radius:99px;border:0;background:#a9d6d1;cursor:pointer;padding:0;transition:width .2s,background .2s}
.sl-dt.on{width:24px;background:var(--t2)}
/* price / contact */
.sl-price{background:linear-gradient(160deg,#06202b,#0b3340);color:#fff;border-radius:28px;padding:56px 40px;display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;position:relative;overflow:hidden}
@media(max-width:860px){.sl-price{grid-template-columns:1fr;padding:40px 24px}}
.sl-price::before{content:"";position:absolute;width:420px;height:420px;right:-120px;top:-160px;border-radius:50%;background:radial-gradient(circle,rgba(20,184,166,.5),transparent 70%)}
.sl-price ul{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:10px;position:relative}
.sl-price li{display:flex;gap:10px;font-size:16px;color:#d4ebe8}
.sl-price li::before{content:"✓";color:#5eead4;font-weight:700}
.sl-pbox{position:relative;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:22px;padding:30px;backdrop-filter:blur(6px)}
/* faq */
.sl-faq{max-width:760px;margin:44px auto 0;display:flex;flex-direction:column;gap:12px}
.sl-q{background:#fff;border:1px solid #e4e9f0;border-radius:16px;overflow:hidden;transition:border-color .2s,box-shadow .2s}
.sl-q.open{border-color:#a8dcd6;box-shadow:0 14px 30px -24px rgba(15,157,146,.6)}
.sl-q button{all:unset;box-sizing:border-box;width:100%;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 24px;cursor:pointer;font-weight:600;font-size:18px;font-family:"Geist",sans-serif}
.sl-q button:focus-visible{outline:2px solid var(--t2);outline-offset:-2px;border-radius:16px}
.sl-q .i{font-size:24px;color:var(--t2);font-weight:400;transition:transform .3s;line-height:1}
.sl-q.open .i{transform:rotate(45deg)}
.sl-qa{max-height:0;opacity:0;overflow:hidden;transition:max-height .4s ease,opacity .4s ease}
.sl-q.open .sl-qa{opacity:1}
.sl-qa p{margin:0;padding:0 24px 22px;font-size:16px;color:#4a5b70;line-height:1.65}
/* final cta + floating button */
.sl-end{background:linear-gradient(135deg,#0f9d92,#5eead4);border-radius:28px;padding:56px 40px;text-align:center;box-shadow:0 30px 70px -30px rgba(15,157,146,.7);position:relative;z-index:2;margin-bottom:-90px}
.sl-end h2{margin:0;font-size:clamp(28px,4vw,42px);letter-spacing:-.025em;color:#fff}
.sl-end p{margin:14px auto 28px;max-width:560px;color:#e6fffb;font-size:18px}
.sl-end .st-btn{background:#fff;color:#0b6f67!important;padding:16px 32px;border-radius:14px;font-size:16px}
.sl-end .st-btn:hover{background:#effffd}
.sl-wa{position:fixed;right:20px;bottom:20px;width:58px;height:58px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 14px 30px -10px rgba(37,211,102,.7);z-index:40;transition:transform .2s}
.sl-wa:hover{transform:scale(1.08)}
.sl-wa svg{filter:brightness(0) invert(1)}
.sl-foot-gap{height:130px;background:#fff}
`;

// ---------------------------------------------------------------- small helpers
const useReveal = () => {
  useEffect(() => {
    const els = [...document.querySelectorAll(".sl-rv")];
    if (typeof IntersectionObserver === "undefined") { els.forEach((e) => e.classList.add("in")); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    els.forEach((e, i) => { e.style.transitionDelay = `${(i % 4) * 70}ms`; io.observe(e); });
    return () => io.disconnect();
  }, []);
};

// the light that follows the mouse inside a card
const spot = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

const Count = ({ to, suffix = "", prefix = "" }) => {
  const ref = useRef(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setV(to); return undefined; }
    let raf = 0;
    const io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t) => { const k = Math.min(1, (t - t0) / 1400); setV(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{prefix}{v}{suffix}</span>;
};

// fibres of the hero: curves drawn once, moved slowly by CSS
const Fibres = () => {
  const lines = Array.from({ length: 46 }, (_, i) => {
    const k = i / 45;
    const y = 260 + k * 300;
    return <path key={i} d={`M-100 ${y + 120} C 300 ${y - 260 + k * 60}, 800 ${y - 60 - k * 90}, 1500 ${y - 300 + k * 140}`} stroke={`rgba(${110 + Math.round(k * 40)},${231 - Math.round(k * 50)},${211 - Math.round(k * 20)},${0.12 + k * 0.26})`} strokeWidth={1 + k * 1.2} fill="none" />;
  });
  return <svg className="sl-fibres" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{lines}</svg>;
};

const CHIPS = [
  [WhatsAppBrand, "WhatsApp"], [InstagramBrand, "Instagram"], [MessengerBrand, "Messenger"], [TelegramBrand, "Telegram"],
  [null, "CRM de matrículas"], [null, "Assistente virtual"], [null, "Fluxos e campanhas"], [null, "Retenção e ambientação"], [null, "Portal do aluno"], [null, "Webhooks"],
];

const FAQ = [
  ["Funciona com a API oficial do WhatsApp?", "Sim. Você conecta o número do WhatsApp Business pela API oficial (Cloud API) da Meta. As conversas de Instagram e Messenger entram pelas integrações oficiais da Meta, e o Telegram pelo bot que você cria."],
  ["A assistente virtual inventa informação?", "Não. Ela só fala dos cursos que estão cadastrados no seu sistema e responde dados da instituição com o que a sua equipe aprovou. Quando não sabe, diz que vai confirmar, registra a dúvida para a equipe e passa a conversa para uma pessoa. Valores, bolsas e prazos não são prometidos pela assistente."],
  ["Preciso de uma chave de inteligência artificial?", "A assistente usa um provedor de IA de sua escolha. A chave pode ser sua (guardada com criptografia) ou a do ambiente, e o consumo aparece em um painel com limite diário."],
  ["A equipe consegue assumir uma conversa?", "A qualquer momento. A assistente passa para o consultor do polo certo, com o resumo do que já foi conversado, e a conversa segue no mesmo lugar. Fora do horário, o lead entra na fila com prioridade."],
  ["Dá para testar antes de ligar para os alunos?", "Dá. Existe um modo de teste em que você conversa como se fosse um lead, vê o que a assistente decidiu em cada mensagem e corrige as respostas. Nada é enviado a ninguém e nenhum lead é criado."],
  ["Como ficam os dados das pessoas?", "Os dados ficam em ambiente protegido, com perfis de acesso por função e histórico de alterações. Você pode pedir a exclusão dos dados a qualquer momento. Veja a Política de Privacidade e a página de exclusão de dados."],
  ["Quanto custa?", "O valor depende do número de atendentes e de canais. Peça uma demonstração e enviamos uma proposta."],
];

const EXAMPLES = [
  ["Primeiro contato", [["a", "Oi"], ["z", "Olá! Tudo bem? Sou a Estela, assistente virtual. Você quer conhecer nossos cursos e fazer sua matrícula ou já é aluno e precisa falar com a tutoria?"]]],
  ["Curso e modalidade", [["a", "Pedagogia é online?"], ["z", "É semipresencial: combina estudos digitais, aulas com professores e uma parte presencial. O calendário de cada turma o consultor confirma com você."]]],
  ["Passando para a equipe", [["a", "Quero me matricular"], ["z", "Perfeito! Vou passar você para um consultor do polo, já com o resumo da nossa conversa."]]],
  ["Já é aluno", [["a", "Já sou aluno, preciso de ajuda com a plataforma"], ["z", "Claro! Vou chamar a tutoria do seu polo para te ajudar."]]],
];

const STEPS = [
  ["Conecte seus canais", "Ligue o número do WhatsApp Business, o Instagram, o Messenger e o Telegram. Cadastre polos, equipe e horários de atendimento."],
  ["Ensine a assistente", "Cadastre os cursos, envie as grades e os textos da instituição e ajuste o jeito de falar. O que a equipe ensina por conversa vale na próxima resposta."],
  ["Teste antes de ligar", "Converse como se fosse um lead, veja o que a assistente decidiu em cada mensagem e corrija o que não ficou bom. Nada é enviado a ninguém."],
  ["Acompanhe e melhore", "Veja o funil, a qualidade do atendimento e as perguntas que ela não soube responder. O que a equipe responde vira conhecimento."],
];

const HowVisual = ({ i }) => (
  <div className="sl-vis">
    <div className={`sl-v ${i === 0 ? "on" : ""}`}><span className="sl-big">01</span><b>Canais conectados</b>
      <div className="sl-conn">
        {[[WhatsAppBrand, "WhatsApp Business"], [InstagramBrand, "Instagram"], [MessengerBrand, "Messenger"], [TelegramBrand, "Telegram"]].map(([B, n], k) => (
          <div className="sl-cn" key={n}><B size={22} />{n}<small style={{ animationDelay: `${k * 0.4}s` }}>Conectado</small></div>
        ))}
      </div>
    </div>
    <div className={`sl-v ${i === 1 ? "on" : ""}`}><span className="sl-big">02</span><b>O que a assistente sabe</b>
      <div className="sl-bars">
        {[["Cursos cadastrados", 92], ["Grades enviadas", 78], ["Textos da instituição", 64], ["Regras de atendimento", 86]].map(([n, w]) => (
          <div className="sl-bar" key={n}><span>{n}</span><i><b style={{ "--w": `${w}%` }} /></i><span>{w}%</span></div>
        ))}
      </div>
    </div>
    <div className={`sl-v ${i === 2 ? "on" : ""}`}><span className="sl-big">03</span><b>Modo de teste</b>
      <div className="sl-msgs" style={{ background: "#e9f4f2", borderRadius: 16, padding: 14 }}>
        <div className="sl-m r" style={{ animationDelay: "0s" }}>Oi</div>
        <div className="sl-m l" style={{ animationDelay: "1.2s" }}>Olá! Sou a Estela, assistente virtual. Você quer conhecer nossos cursos ou já é aluno?</div>
        <div className="sl-m r" style={{ animationDelay: "2.6s" }}>Quero Pedagogia</div>
      </div>
      <span className="sl-live"><i />sem enviar nada a ninguém</span>
    </div>
    <div className={`sl-v ${i === 3 ? "on" : ""}`}><span className="sl-big">04</span><b>Funil de matrículas</b>
      <div className="sl-bars">
        {[["Novo lead", 88], ["Primeiro contato", 64], ["Qualificado", 41], ["Matrícula", 22]].map(([n, w]) => (
          <div className="sl-bar" key={n}><span>{n}</span><i><b style={{ "--w": `${w}%` }} /></i><span>{w}</span></div>
        ))}
      </div>
      <small style={{ color: "#6b7d90" }}>Exemplo ilustrativo</small>
    </div>
  </div>
);

const How = () => {
  const [on, setOn] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setOn(Number(e.target.dataset.i)); }), { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className="sl-how">
      <div className="sl-how-l"><HowVisual i={on} /></div>
      <div>
        {STEPS.map(([t, d], i) => (
          <div key={t} className={`sl-stepc ${on === i ? "on" : ""}`} data-i={i} ref={(el) => { refs.current[i] = el; }}>
            <div><span className="bar" /><div><b className="k">PASSO 0{i + 1}</b><h3>{t}</h3><p>{d}</p></div></div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Carousel = () => {
  const ref = useRef(null);
  const [page, setPage] = useState(0);
  const paused = useRef(false);
  const go = useCallback((n) => {
    const el = ref.current;
    if (!el) return;
    const kids = el.children;
    const k = (n + kids.length) % kids.length;
    el.scrollTo({ left: kids[k].offsetLeft - (el.clientWidth - kids[k].clientWidth) / 2, behavior: "smooth" });
    setPage(k);
  }, []);
  useEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const t = setInterval(() => { if (!paused.current) go(page + 1); }, 5200);
    return () => clearInterval(t);
  }, [page, go]);
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => { paused.current = true; }} onMouseLeave={() => { paused.current = false; }}>
      <button type="button" className="sl-ar" style={{ left: 0 }} aria-label="Anterior" onClick={() => go(page - 1)}>‹</button>
      <div className="sl-ctr" ref={ref} onScroll={(e) => { const el = e.currentTarget; const c = el.scrollLeft + el.clientWidth / 2; let best = 0; let d = 1e9; [...el.children].forEach((k, i) => { const m = Math.abs(k.offsetLeft + k.clientWidth / 2 - c); if (m < d) { d = m; best = i; } }); if (best !== page) setPage(best); }}>
        {EXAMPLES.map(([tag, msgs]) => (
          <div className="sl-cc" key={tag}><span className="tag">{tag} · exemplo</span>{msgs.map(([w, t]) => <div key={t} className={`b ${w}`}>{t}</div>)}</div>
        ))}
      </div>
      <button type="button" className="sl-ar" style={{ right: 0 }} aria-label="Próximo" onClick={() => go(page + 1)}>›</button>
      <div className="sl-dotsr">{EXAMPLES.map(([t], i) => <button key={t} type="button" aria-label={`Exemplo ${i + 1}`} className={`sl-dt ${page === i ? "on" : ""}`} onClick={() => go(i)} />)}</div>
    </div>
  );
};

const Faq = () => {
  const [open, setOpen] = useState(0);
  const heights = useRef({});
  return (
    <div className="sl-faq">
      {FAQ.map(([q, a], i) => (
        <div key={q} className={`sl-q ${open === i ? "open" : ""}`}>
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}><span>{q}</span><span className="i" aria-hidden="true">+</span></button>
          <div className="sl-qa" style={{ maxHeight: open === i ? (heights.current[i] || 400) : 0 }} ref={(el) => { if (el) heights.current[i] = el.scrollHeight; }}><p>{a}</p></div>
        </div>
      ))}
    </div>
  );
};

const Landing = () => {
  useMeta("Chat Acadêmico — atendimento e CRM para instituições de ensino", "Reúna WhatsApp, Instagram, Messenger e Telegram em uma caixa de entrada, organize o funil de matrículas e atenda 24 horas com uma assistente virtual que passa para a equipe certa.");
  useReveal();
  const items = [...CHIPS, ...CHIPS];
  return (
    <SiteShell overHero>
      <style>{css}</style>
      <main className="sl">
        <section className="sl-hero">
          <Fibres />
          <div className="sl-hero-in">
            <h1 className="sl-h1">Todas as conversas dos seus futuros alunos, em um só lugar</h1>
            <p className="sl-lead">O Chat Acadêmico reúne WhatsApp, Instagram, Messenger e Telegram em uma única caixa de entrada, organiza o funil de matrículas e coloca uma assistente virtual para atender a qualquer hora, passando a conversa para o consultor certo na hora certa.</p>
            <div className="sl-cta">
              <a href={contactHref()} className="st-btn p">Solicitar demonstração</a>
              <a href="#recursos" className="st-btn sl-ghost">Ver os recursos</a>
            </div>
            <div className="sl-trust"><span>API oficial do WhatsApp Business</span><span>Atendimento por polo e por equipe</span><span>Feito para a LGPD</span></div>
          </div>
          <div className="sl-marq" aria-hidden="true">
            <div className="sl-track">
              {items.map(([B, n], i) => <span className="sl-chip" key={`${n}-${i}`}>{B ? <B size={24} /> : null}{n}</span>)}
            </div>
          </div>
        </section>

        <section id="recursos" className="sl-sec">
          <div className="sl-wrap">
            <div className="sl-rv" style={{ maxWidth: 780 }}>
              <span className="sl-eb">Recursos</span>
              <h2 className="sl-h2">Tudo o que o atendimento de matrículas precisa, no mesmo lugar</h2>
              <p className="sl-sub">Quando o lead pergunta e ninguém responde, ele procura outra instituição. Aqui a conversa chega, é respondida e vai para a pessoa certa.</p>
            </div>
            <div className="sl-bento">
              <article className="sl-card teal sl-rv" style={{ gridColumn: "span 7" }} onMouseMove={spot}>
                <h3>Uma caixa de entrada para todos os canais</h3>
                <p className="d">Contato, histórico e responsável de cada conversa, por polo, equipe e consultor.</p>
                <div className="sl-stage"><div className="sl-shot"><img src={inbox} alt="Caixa de entrada com as conversas dos leads e a janela de atendimento" /></div></div>
              </article>
              <article className="sl-card dark sl-rv" style={{ gridColumn: "span 5" }} onMouseMove={spot}>
                <h3>Assistente virtual que atende a qualquer hora</h3>
                <p className="d">Apresenta-se, entende o que a pessoa quer e conduz sem interrogatório.</p>
                <div className="sl-stage sl-glass"><div className="sl-msgs">
                  <div className="sl-m r" style={{ animationDelay: "0s" }}>Oi</div>
                  <div className="sl-m l" style={{ animationDelay: "1.1s" }}>Olá! Sou a Estela, assistente virtual. Você quer conhecer nossos cursos ou já é aluno?</div>
                  <div className="sl-m r" style={{ animationDelay: "2.4s" }}>Quero Pedagogia, moro em Porto Velho</div>
                  <div className="sl-m l" style={{ animationDelay: "3.6s" }}>Ótimo! Posso te mostrar a grade e como funciona o curso?</div>
                </div></div>
              </article>
              <article className="sl-card sl-rv" style={{ gridColumn: "span 4" }} onMouseMove={spot}>
                <div className="sl-dots" />
                <h3>CRM e funil de matrículas</h3>
                <p className="d">Cada lead com etapa, responsável, próxima ação e histórico.</p>
                <div className="sl-stage"><div className="sl-bars">
                  {[["Novo lead", 86], ["Primeiro contato", 62], ["Qualificado", 38], ["Matrícula", 20]].map(([n, w]) => <div className="sl-bar" key={n}><span>{n}</span><i><b style={{ "--w": `${w}%` }} /></i><span>{w}</span></div>)}
                  <small style={{ color: "#6b7d90" }}>Exemplo ilustrativo</small>
                </div></div>
              </article>
              <article className="sl-card dark sl-rv" style={{ gridColumn: "span 4" }} onMouseMove={spot}>
                <h3>Passa para a equipe certa, com o resumo</h3>
                <p className="d">Polo, fila e consultor definidos pelas regras da sua operação, dentro e fora do expediente.</p>
                <div className="sl-stage"><div className="sl-route">
                  <div className="sl-r" style={{ animationDelay: "0s" }}><em>1</em>Lead qualificado pela assistente</div>
                  <div className="sl-r" style={{ animationDelay: ".9s" }}><em>2</em>Polo e fila do comercial</div>
                  <div className="sl-r" style={{ animationDelay: "1.8s" }}><em>3</em>Consultor recebe com o resumo</div>
                  <span className="sl-live"><i />encaminhamento registrado</span>
                </div></div>
              </article>
              <article className="sl-card sl-rv" style={{ gridColumn: "span 4" }} onMouseMove={spot}>
                <h3>Teste e treine antes de ligar</h3>
                <p className="d">Veja o que a assistente decidiu em cada mensagem e ensine por conversa.</p>
                <div className="sl-stage"><div className="sl-shot" style={{ borderColor: "#dce6ee" }}><img src={agent} alt="Teste da assistente mostrando o que ela decidiu em cada mensagem" /></div></div>
              </article>
              <article className="sl-card sl-rv" style={{ gridColumn: "span 6" }} onMouseMove={spot}>
                <h3>Funil, tarefas e metas por consultor e por polo</h3>
                <p className="d">Painel com motivos de perda, origem dos leads e cursos mais procurados.</p>
                <div className="sl-stage"><div className="sl-shot" style={{ borderColor: "#dce6ee" }}><img src={crm} alt="Funil de captação do CRM com as colunas das etapas" /></div></div>
              </article>
              <article className="sl-card teal sl-rv" style={{ gridColumn: "span 6" }} onMouseMove={spot}>
                <h3>Fluxos, campanhas e automações</h3>
                <p className="d">Monte o roteiro do atendimento em blocos e dispare mensagens a quem aceitou receber.</p>
                <div className="sl-stage"><div className="sl-shot"><img src={flows} alt="Editor visual de fluxos de atendimento" /></div></div>
              </article>
            </div>
          </div>
        </section>

        <section className="sl-stats">
          <div className="sl-stats-g">
            <div className="sl-rv"><div className="sl-num"><Count to={4} /></div><div className="sl-nl">canais em uma caixa de entrada</div></div>
            <div className="sl-rv"><div className="sl-num"><Count to={24} suffix=" h" /></div><div className="sl-nl">de atendimento da assistente</div></div>
            <div className="sl-rv"><div className="sl-num"><Count to={4} /></div><div className="sl-nl">perfis de acesso por função</div></div>
            <div className="sl-rv"><div className="sl-num"><Count to={100} suffix="%" /></div><div className="sl-nl">dos cursos vêm do seu cadastro</div></div>
          </div>
        </section>

        <section id="como-funciona" className="sl-sec">
          <div className="sl-wrap">
            <div className="sl-rv"><span className="sl-eb">Como funciona</span><h2 className="sl-h2">Comece em quatro passos</h2><p className="sl-sub">Role para ver: o painel ao lado acompanha cada etapa.</p></div>
            <How />
          </div>
        </section>

        <section className="sl-car">
          <div className="sl-wrap">
            <div className="sl-center sl-rv"><span className="sl-eb">Na prática</span><h2 className="sl-h2">Como a assistente conversa</h2><p className="sl-sub">Exemplos ilustrativos de respostas. Cada instituição ajusta o tom, as regras e o que a assistente pode dizer.</p></div>
            <Carousel />
          </div>
        </section>

        <section id="seguranca" className="sl-sec">
          <div className="sl-wrap">
            <div className="sl-rv sl-center"><span className="sl-eb">Segurança e privacidade</span><h2 className="sl-h2">Seus dados, suas regras, desde o primeiro dia</h2></div>
            <div className="sl-bento" style={{ marginTop: 40 }}>
              {[["Integrações oficiais", "WhatsApp Business pela Cloud API e Instagram e Messenger pelas APIs da Meta, com as permissões que você autoriza."], ["Controle de acesso", "Perfis de administrador, coordenação, consultor e tutor. Cada pessoa vê só o que precisa, e as chaves dos canais ficam criptografadas."], ["Uso limitado ao atendimento", "Histórico de alterações da assistente com restauração e exclusão de dados a pedido."]].map(([t, d]) => (
                <article key={t} className="sl-card sl-rv" style={{ gridColumn: "span 4", minHeight: 190 }} onMouseMove={spot}><h3>{t}</h3><p className="d" style={{ opacity: 1, color: "#4a5b70" }}>{d}</p></article>
              ))}
            </div>
            <p className="sl-center" style={{ marginTop: 22, fontSize: 15 }}><Link to="/privacidade" style={{ color: "#0b6f67", fontWeight: 600 }}>Política de Privacidade</Link> · <Link to="/termos" style={{ color: "#0b6f67", fontWeight: 600 }}>Termos de Uso</Link> · <Link to="/exclusao-de-dados" style={{ color: "#0b6f67", fontWeight: 600 }}>Exclusão de dados</Link></p>
          </div>
        </section>

        <section className="sl-sec" style={{ paddingTop: 0 }}>
          <div className="sl-wrap">
            <div className="sl-price sl-rv">
              <div style={{ position: "relative" }}>
                <span className="sl-eb" style={{ color: "#5eead4" }}>Contratação</span>
                <h2 className="sl-h2" style={{ color: "#fff" }}>Um valor pensado para o tamanho da sua operação</h2>
                <ul>
                  <li>Todos os recursos em qualquer tamanho de equipe</li>
                  <li>O valor depende do número de atendentes e de canais</li>
                  <li>Demonstração com os cursos e os polos da sua instituição</li>
                  <li>Sem números inventados: você vê funcionando antes de decidir</li>
                </ul>
              </div>
              <div className="sl-pbox">
                <b style={{ fontSize: 20, fontFamily: "Geist,sans-serif" }}>Peça sua demonstração</b>
                <p style={{ color: "#b9d6d2", fontSize: 15.5, lineHeight: 1.6, margin: "10px 0 22px" }}>Conte quantos atendentes e quais canais você usa e enviamos uma proposta.</p>
                <a href={contactHref()} className="st-btn p" style={{ width: "100%" }}>Solicitar demonstração</a>
              </div>
            </div>
          </div>
        </section>

        <section id="perguntas" className="sl-sec" style={{ paddingTop: 0 }}>
          <div className="sl-wrap"><div className="sl-center sl-rv"><span className="sl-eb">Dúvidas</span><h2 className="sl-h2">Perguntas frequentes</h2></div><Faq /></div>
        </section>

        <section className="sl-sec" style={{ paddingBottom: 0, paddingTop: 20 }}>
          <div className="sl-wrap"><div className="sl-end sl-rv"><h2>Veja o seu atendimento de matrículas funcionando</h2><p>Peça uma demonstração com os cursos e os polos da sua instituição.</p><div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}><a href={contactHref()} className="st-btn">Solicitar demonstração</a><Link to="/login" className="st-btn sl-ghost" style={{ borderRadius: 14, padding: "16px 28px" }}>Já tenho acesso</Link></div></div></div>
        </section>
        <div className="sl-foot-gap" style={{ background: "#fff" }} />
      </main>
      {SITE.whatsapp ? <a className="sl-wa" href={contactHref("Quero conhecer o Chat Acadêmico")} aria-label="Falar no WhatsApp"><WhatsAppBrand size={28} /></a> : null}
    </SiteShell>
  );
};

export default Landing;
