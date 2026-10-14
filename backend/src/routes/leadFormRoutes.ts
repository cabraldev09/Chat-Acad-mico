import express, { Request, Response } from "express";

import Course from "../models/Course";
import Affiliate from "../models/Affiliate";
import { getSetting } from "../helpers/AppSettings";
import { normalizeEmail, normalizePhone } from "../helpers/Phone";
import { upsertLead } from "../services/CrmServices/LeadCore";
import { CRM_OPTIONS } from "../services/CrmServices/crmOptions";

// Public lead capture form (embed with an <iframe>) and its JSON endpoint.
const router = express.Router();

const hits = new Map<string, number[]>();
const throttled = (key: string): boolean => {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < 600000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > 8; // 8 submissions / 10 min per IP
};

const validToken = async (token: string): Promise<boolean> => {
  const stored = await getSetting("crm_form_token", "");
  return !!stored && stored === token;
};

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const page = (opts: { title: string; color: string; courses: Course[]; sub: string }): string => {
  const { title, color, courses } = opts;
  const opt = (arr: string[]) => arr.map(v => `<option>${esc(v)}</option>`).join("");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
:root{--c:${/^#[0-9a-f]{6}$/i.test(color) ? color : "#0B4279"}}
*{box-sizing:border-box}body{margin:0;font-family:Geist,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f8fb;color:#0b1a2e}
.wrap{max-width:520px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px;letter-spacing:-.02em}p.sub{margin:0 0 20px;color:#64748b;font-size:14px}
form{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;display:grid;gap:14px;box-shadow:0 12px 30px -18px rgba(11,66,121,.35)}
label{display:grid;gap:6px;font-size:13px;font-weight:500;color:#334155}
input,select{font:inherit;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:inherit}
input:focus,select:focus{outline:none;border-color:#0693E3;box-shadow:0 0 0 3px rgba(6,147,227,.2)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:480px){.row{grid-template-columns:1fr}}
.consent{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:12.5px;color:#64748b}.consent input{margin-top:2px}
button{font:inherit;font-weight:600;padding:12px;border:0;border-radius:10px;background:var(--c);color:#fff;cursor:pointer;transition:transform .15s,filter .15s}
button:hover{filter:brightness(1.1)}button:active{transform:scale(.98)}button:disabled{opacity:.6;cursor:default}
.hp{position:absolute;left:-9999px}.msg{padding:14px;border-radius:10px;font-size:14px;display:none}
.ok{background:#dcfce7;color:#14532d}.err{background:#fee2e2;color:#7f1d1d}
</style>
<div class="wrap"><h1>${esc(title)}</h1><p class="sub">${esc(opts.sub)}</p>
<form id="f" novalidate>
<label>Nome completo<input name="name" required autocomplete="name"></label>
<div class="row"><label>WhatsApp<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="(11) 99999-0000"></label>
<label>E-mail<input name="email" type="email" autocomplete="email"></label></div>
<label>Curso de interesse<select name="courseId"><option value="">Selecione</option>${courses.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>
<div class="row"><label>Modalidade<select name="modality"><option value="">Selecione</option>${opt(CRM_OPTIONS.modalities)}</select></label>
<label>Forma de ingresso<select name="admissionType"><option value="">Selecione</option>${opt(CRM_OPTIONS.admissionTypes)}</select></label></div>
<label>Cidade<input name="city" autocomplete="address-level2"></label>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="consent"><input type="checkbox" name="consent" required> Concordo em receber contato por WhatsApp, e-mail ou telefone sobre cursos, conforme a LGPD.</label>
<button id="b">Quero ser contatado</button>
<div id="ok" class="msg ok"></div><div id="er" class="msg err"></div>
</form></div>
<script>
var q=new URLSearchParams(location.search);
document.getElementById('f').addEventListener('submit',function(e){
  e.preventDefault();var f=e.target,b=document.getElementById('b'),ok=document.getElementById('ok'),er=document.getElementById('er');
  ok.style.display=er.style.display='none';
  var d={};new FormData(f).forEach(function(v,k){d[k]=v});d.consent=f.consent.checked;
  ['utm_source','utm_medium','utm_campaign'].forEach(function(k){if(q.get(k))d[k]=q.get(k)});
  b.disabled=true;
  fetch(location.pathname.replace(/\\/$/,'')+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
  .then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})})
  .then(function(r){if(r.s<300){ok.textContent=r.j.message;ok.style.display='block';f.reset();}else{er.textContent=r.j.error||'Não foi possível enviar.';er.style.display='block';}b.disabled=false})
  .catch(function(){er.textContent='Falha de conexão. Tente de novo.';er.style.display='block';b.disabled=false});
});
</script></html>`;
};

router.get("/:token", async (req: Request, res: Response) => {
  if (!(await validToken(req.params.token))) return res.status(404).send("Formulário indisponível");
  const [title, color, courses] = await Promise.all([
    getSetting("crm_form_title", "Quero conhecer a instituição"),
    getSetting("crm_form_color", "#0B4279"),
    Course.findAll({ where: { active: true }, order: [["name", "ASC"]] })
  ]);
  return res.type("html").send(page({ title, color, courses, sub: "Preencha seus dados e um consultor fala com você." }));
});

// validates the submission and creates (or enriches) the lead; the affiliate, when there is one, owns the referral
const submit = async (req: Request, res: Response, affiliate: Affiliate | null) => {
  if (throttled(req.ip || "")) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  const b = req.body || {};
  if (b.website) return res.json({ message: "Recebido" }); // honeypot: pretend success
  const name = String(b.name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Informe seu nome." });
  if (!normalizePhone(b.phone)) return res.status(400).json({ error: "Informe um WhatsApp válido com DDD." });
  if (b.email && !normalizeEmail(b.email)) return res.status(400).json({ error: "E-mail inválido." });
  if (b.consent !== true) return res.status(400).json({ error: "É preciso aceitar o contato para continuar." });

  const course = b.courseId ? await Course.findByPk(Number(b.courseId)) : null;
  const clip = (v: any, n = 120) => (v ? String(v).slice(0, n) : undefined);
  await upsertLead({
    name: clip(name, 120),
    phone: b.phone,
    email: b.email,
    city: clip(b.city, 80),
    courseId: course ? course.id : null,
    modality: CRM_OPTIONS.modalities.includes(b.modality) ? b.modality : undefined,
    admissionType: CRM_OPTIONS.admissionTypes.includes(b.admissionType) ? b.admissionType : undefined,
    source: affiliate ? "Indicação" : "Site / formulário",
    channel: affiliate ? "affiliate" : "form",
    utmSource: clip(b.utm_source),
    utmMedium: clip(b.utm_medium),
    utmCampaign: clip(b.utm_campaign),
    consentAt: new Date(),
    ...(affiliate ? { affiliateId: affiliate.id, ownerId: affiliate.ownerId } : {})
  });
  return res.json({ message: await getSetting("crm_form_thanks", "Recebemos seus dados! Em breve um consultor entra em contato.") });
};

router.post("/:token/submit", express.json(), async (req: Request, res: Response) => {
  if (!(await validToken(req.params.token))) return res.status(404).json({ error: "Formulário indisponível" });
  return submit(req, res, null);
});

// Referral link of an affiliate (/r/CODE): the same form, and the lead is credited to the affiliate
export const referralRouter = express.Router();

const activeAffiliate = (code: string) =>
  Affiliate.findOne({ where: { refCode: String(code || "").toUpperCase(), status: "active" } });

referralRouter.get("/:code", async (req: Request, res: Response) => {
  const aff = await activeAffiliate(req.params.code);
  if (!aff) return res.status(404).send("Link indisponível");
  const [title, color, courses] = await Promise.all([
    getSetting("crm_form_title", "Quero conhecer a instituição"),
    getSetting("crm_form_color", "#0B4279"),
    Course.findAll({ where: { active: true }, order: [["name", "ASC"]] })
  ]);
  return res.type("html").send(page({ title, color, courses, sub: `Indicação de ${aff.name.split(" ")[0]}. Preencha seus dados e um consultor fala com você.` }));
});

referralRouter.post("/:code/submit", express.json(), async (req: Request, res: Response) => {
  const aff = await activeAffiliate(req.params.code);
  if (!aff) return res.status(404).json({ error: "Link indisponível" });
  return submit(req, res, aff);
});

export default router;
