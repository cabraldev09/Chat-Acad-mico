import React, { useState } from "react";
import { Link } from "react-router-dom";

import SiteShell, { useMeta } from "./Shell";
import { contactHref } from "./config";
import inbox from "../../assets/site/inbox.webp";
import crm from "../../assets/site/crm.webp";
import agent from "../../assets/site/agent.webp";
import flows from "../../assets/site/flows.webp";

const css = `
.sl-hero{padding:72px 0 40px;text-align:center}
.sl-eyebrow{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#0b4279}
.sl-h1{font-size:clamp(36px,6vw,62px);line-height:1.04;letter-spacing:-.04em;font-weight:700;margin:16px auto 0;max-width:860px}
.sl-lead{font-size:clamp(17px,2.2vw,20px);color:#44546b;max-width:720px;margin:20px auto 0}
.sl-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:32px}
.sl-trust{display:flex;gap:10px 22px;justify-content:center;flex-wrap:wrap;margin-top:22px;font-size:14px;color:#5d6f86}
.sl-trust span::before{content:"✓";margin-right:7px;color:#0b4279;font-weight:700}
.sl-shot{margin:48px auto 0;border:1px solid #d9e1ec;border-radius:16px;overflow:hidden;box-shadow:0 30px 60px -40px rgba(15,29,51,.45);background:#fff}
.sl-shot img{display:block;width:100%;height:auto}
.sl-sec{padding:88px 0 0}
.sl-h2{font-size:clamp(28px,4vw,40px);line-height:1.1;letter-spacing:-.03em;font-weight:700;margin:0;max-width:720px}
.sl-sub{color:#44546b;font-size:18px;max-width:680px;margin:14px 0 0}
.sl-three{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:36px}
@media(max-width:820px){.sl-three{grid-template-columns:1fr}}
.sl-card{border:1px solid #e1e8f1;border-radius:14px;padding:22px;background:#fff}
.sl-card h3{margin:0 0 8px;font-size:18px;letter-spacing:-.01em}
.sl-card p{margin:0;color:#44546b;font-size:15.5px}
.sl-row{display:grid;grid-template-columns:1fr 1.1fr;gap:56px;align-items:center;margin-top:72px}
.sl-row.rev{grid-template-columns:1.1fr 1fr}.sl-row.rev .sl-txt{order:2}
@media(max-width:900px){.sl-row,.sl-row.rev{grid-template-columns:1fr;gap:28px}.sl-row.rev .sl-txt{order:0}}
.sl-txt h3{font-size:clamp(24px,3vw,32px);line-height:1.12;letter-spacing:-.03em;margin:0}
.sl-txt p{color:#44546b;font-size:17px;margin:14px 0 0}
.sl-ul{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px}
.sl-ul li{display:flex;gap:10px;font-size:16px}
.sl-ul li::before{content:"✓";color:#0b4279;font-weight:700;flex:none}
.sl-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:36px;counter-reset:s}
@media(max-width:820px){.sl-steps{grid-template-columns:1fr}}
.sl-step{border-top:2px solid #0b4279;padding-top:16px}
.sl-step b{display:block;font-size:13px;letter-spacing:.08em;color:#0b4279;margin-bottom:6px}
.sl-step h3{margin:0 0 8px;font-size:20px}.sl-step p{margin:0;color:#44546b}
.sl-sec-dark{background:#f4f7fb;margin-top:96px;padding:72px 0;border-block:1px solid #e6ebf2}
.sl-sec-dark .sl-sec{padding:0}
.sl-faq{margin-top:28px;border-top:1px solid #e1e8f1;max-width:820px}
.sl-q{border-bottom:1px solid #e1e8f1}
.sl-q button{all:unset;box-sizing:border-box;width:100%;display:flex;justify-content:space-between;gap:16px;padding:20px 2px;cursor:pointer;font-weight:600;font-size:17px}
.sl-q button:focus-visible{outline:2px solid #0b4279;outline-offset:2px}
.sl-q div{padding:0 2px 20px;color:#44546b;font-size:16px;max-width:720px}
.sl-final{margin-top:96px;background:#0b4279;color:#fff;border-radius:20px;padding:56px 32px;text-align:center}
.sl-final h2{margin:0;font-size:clamp(26px,4vw,38px);letter-spacing:-.03em}
.sl-final p{margin:14px auto 0;max-width:560px;color:#cfe0f3;font-size:17px}
.sl-final .st-btn.p{background:#fff;color:#0b4279!important}.sl-final .st-btn.p:hover{background:#eaf1fa}
.sl-final .st-btn.s{background:transparent;border-color:#5f87b3;color:#fff}.sl-final .st-btn.s:hover{background:#0f4f8f}
`;

const FAQ = [
  ["Funciona com a API oficial do WhatsApp?", "Sim. Você conecta o número do WhatsApp Business pela API oficial (Cloud API) da Meta. As conversas de Instagram e Messenger entram pelas integrações oficiais da Meta, e o Telegram pelo bot que você cria."],
  ["A assistente virtual inventa informação?", "Não. Ela só fala dos cursos que estão cadastrados no seu sistema e responde dados da instituição com o que a sua equipe aprovou. Quando não sabe, diz que vai confirmar, registra a dúvida para a equipe e passa a conversa para uma pessoa. Valores, bolsas e prazos não são prometidos pela assistente."],
  ["Preciso de uma chave de inteligência artificial?", "A assistente usa um provedor de IA de sua escolha. A chave pode ser sua (guardada com criptografia) ou a do ambiente, e o consumo aparece em um painel com limite diário."],
  ["A equipe consegue assumir uma conversa?", "A qualquer momento. A assistente passa para o consultor do polo certo, com o resumo do que já foi conversado, e a conversa segue no mesmo lugar. Fora do horário, o lead entra na fila com prioridade."],
  ["Dá para testar antes de ligar para os alunos?", "Dá. Existe um modo de teste em que você conversa como se fosse um lead, vê o que a assistente decidiu em cada mensagem e corrige as respostas. Nada é enviado a ninguém e nenhum lead é criado."],
  ["Como ficam os dados das pessoas?", "Os dados ficam em ambiente protegido, com perfis de acesso por função e histórico de alterações. Você pode pedir a exclusão dos dados a qualquer momento. Veja a Política de Privacidade e a página de exclusão de dados."],
  ["Quanto custa?", "O valor depende do número de atendentes e de canais. Peça uma demonstração e enviamos uma proposta."],
];

const Faq = () => {
  const [open, setOpen] = useState(0);
  return (
    <div className="sl-faq">
      {FAQ.map(([q, a], i) => (
        <div key={q} className="sl-q">
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}><span>{q}</span><span aria-hidden="true">{open === i ? "–" : "+"}</span></button>
          {open === i && <div>{a}</div>}
        </div>
      ))}
    </div>
  );
};

const Feature = ({ rev, title, text, items, img, alt }) => (
  <div className={`sl-row ${rev ? "rev" : ""}`}>
    <div className="sl-txt">
      <h3>{title}</h3>
      <p>{text}</p>
      <ul className="sl-ul">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
    <div className="sl-shot" style={{ margin: 0 }}><img src={img} alt={alt} /></div>
  </div>
);

const Landing = () => {
  useMeta("Chat Acadêmico — atendimento e CRM para instituições de ensino", "Reúna WhatsApp, Instagram, Messenger e Telegram em uma caixa de entrada, organize o funil de matrículas e atenda 24 horas com uma assistente virtual que passa para a equipe certa.");
  return (
    <SiteShell>
      <style>{css}</style>
      <main>
        <section className="st-wrap sl-hero">
          <div className="sl-eyebrow">Atendimento e CRM para instituições de ensino</div>
          <h1 className="sl-h1">Todas as conversas dos seus futuros alunos, em um só lugar</h1>
          <p className="sl-lead">O Chat Acadêmico reúne WhatsApp, Instagram, Messenger e Telegram em uma única caixa de entrada, organiza o funil de matrículas e coloca uma assistente virtual para atender a qualquer hora, passando a conversa para o consultor certo na hora certa.</p>
          <div className="sl-cta">
            <a href={contactHref()} className="st-btn p">Solicitar demonstração</a>
            <a href="#recursos" className="st-btn s">Ver os recursos</a>
          </div>
          <div className="sl-trust"><span>API oficial do WhatsApp Business</span><span>Atendimento por polo e por equipe</span><span>Feito para a LGPD</span></div>
          <div className="sl-shot"><img src={inbox} alt="Caixa de entrada do Chat Acadêmico com as conversas dos leads e o atendimento" /></div>
        </section>

        <section className="st-wrap sl-sec">
          <h2 className="sl-h2">Quem atende bem no primeiro contato matricula mais</h2>
          <p className="sl-sub">Quando o lead pergunta e ninguém responde, ele procura outra instituição. O Chat Acadêmico resolve os três pontos em que a matrícula costuma se perder.</p>
          <div className="sl-three">
            <div className="sl-card"><h3>Conversas espalhadas</h3><p>Cada canal em um aplicativo diferente, cada consultor com um número. Aqui tudo chega na mesma caixa de entrada, com o histórico do contato.</p></div>
            <div className="sl-card"><h3>Leads que esfriam</h3><p>A assistente responde na hora, descobre o curso e a cidade, e a equipe recebe o lead qualificado, com o resumo do atendimento.</p></div>
            <div className="sl-card"><h3>Equipe sem visão</h3><p>Funil, tarefas, metas e resultados por consultor e por polo em um painel, sem planilha.</p></div>
          </div>
        </section>

        <section id="recursos" className="st-wrap sl-sec">
          <h2 className="sl-h2">Tudo o que o atendimento de matrículas precisa</h2>
          <Feature title="Uma caixa de entrada para todos os canais" text="WhatsApp, Instagram, Messenger e Telegram no mesmo lugar, com o contato, o histórico e o responsável de cada conversa."
            items={["Atendimento por polo, equipe e consultor, com transferência entre eles", "Respostas rápidas, etiquetas, notas internas e agendamento de mensagens", "Grupos e comunidades do WhatsApp, quando a sua operação usa"]} img={inbox} alt="Lista de conversas e janela de atendimento" />
          <Feature rev title="Uma assistente virtual que atende e qualifica" text="Ela se apresenta, entende o que a pessoa quer e conduz a conversa sem interrogatório. Quando chega a hora, passa para o consultor com tudo anotado."
            items={["Só fala dos cursos cadastrados e do que a instituição aprovou: não inventa valor, bolsa ou prazo", "Envia a grade do curso e explica estágio, tutoria e modalidade", "Encaminha o aluno para a tutoria ou a secretaria e o lead para o consultor do polo", "Você ensina por conversa, corrige respostas e vê o efeito na hora"]} img={agent} alt="Teste da assistente virtual mostrando o que ela decidiu em cada mensagem" />
          <Feature title="CRM e funil de matrículas" text="Do primeiro contato à matrícula, cada lead tem etapa, responsável, próxima ação e histórico."
            items={["Painel com o funil, motivos de perda, origem dos leads e cursos mais procurados", "Tarefas e lembretes de retorno, com cadência de follow-up", "Metas, comissões e resultados por consultor e por polo"]} img={crm} alt="Painel do CRM com o funil de matrículas" />
          <Feature rev title="Fluxos, campanhas e automações" text="Monte o roteiro do atendimento em um editor visual e dispare mensagens para quem aceitou receber."
            items={["Editor de fluxos por blocos, com testes antes de publicar", "Campanhas para listas de contatos, com controle de envio e de consentimento", "Gatilhos e webhooks para ligar o sistema às suas outras ferramentas"]} img={flows} alt="Editor visual de fluxos de atendimento" />
        </section>

        <section className="sl-sec-dark" id="como-funciona">
          <div className="st-wrap">
            <h2 className="sl-h2">Comece em poucos passos</h2>
            <div className="sl-steps">
              <div className="sl-step"><b>1</b><h3>Conecte os canais</h3><p>Ligue o número do WhatsApp Business, o Instagram, o Messenger e o Telegram. Cadastre polos, equipe e horários.</p></div>
              <div className="sl-step"><b>2</b><h3>Ensine a assistente</h3><p>Cadastre os cursos, envie as grades e os textos da instituição e ajuste o jeito de falar. Teste antes de ligar.</p></div>
              <div className="sl-step"><b>3</b><h3>Acompanhe e melhore</h3><p>Veja o funil, a qualidade do atendimento e as perguntas que ela não soube responder. O que a equipe responde vira conhecimento.</p></div>
            </div>
          </div>
        </section>

        <section className="st-wrap sl-sec">
          <h2 className="sl-h2">Do primeiro contato ao pós-matrícula</h2>
          <p className="sl-sub">O mesmo sistema acompanha o aluno depois que ele se matricula.</p>
          <div className="sl-three">
            <div className="sl-card"><h3>Ambientação</h3><p>Checklist de primeiro acesso, boas-vindas e acompanhamento do tutor nas primeiras semanas.</p></div>
            <div className="sl-card"><h3>Retenção</h3><p>Pesquisa de satisfação, alunos em risco e janela de rematrícula, com envio pelo WhatsApp.</p></div>
            <div className="sl-card"><h3>Análise curricular e propostas</h3><p>Análise do histórico de quem transfere e propostas com a identidade da instituição.</p></div>
          </div>
        </section>

        <section id="seguranca" className="st-wrap sl-sec">
          <h2 className="sl-h2">Segurança e privacidade desde o primeiro dia</h2>
          <div className="sl-three">
            <div className="sl-card"><h3>Integrações oficiais</h3><p>WhatsApp Business pela Cloud API e Instagram e Messenger pelas APIs da Meta, com as permissões que você autoriza.</p></div>
            <div className="sl-card"><h3>Controle de acesso</h3><p>Perfis de administrador, coordenação, consultor e tutor, e cada pessoa vê só o que precisa. As chaves dos canais ficam criptografadas.</p></div>
            <div className="sl-card"><h3>Seus dados, suas regras</h3><p>Uso dos dados limitado ao atendimento, histórico de alterações da assistente e exclusão a pedido. <Link to="/privacidade" style={{ color: "#0b4279", fontWeight: 600 }}>Leia a Política de Privacidade</Link>.</p></div>
          </div>
        </section>

        <section id="perguntas" className="st-wrap sl-sec">
          <h2 className="sl-h2">Perguntas frequentes</h2>
          <Faq />
        </section>

        <section className="st-wrap">
          <div className="sl-final">
            <h2>Veja o seu atendimento de matrículas funcionando</h2>
            <p>Peça uma demonstração com os cursos e os polos da sua instituição.</p>
            <div className="sl-cta"><a href={contactHref()} className="st-btn p">Solicitar demonstração</a><Link to="/login" className="st-btn s">Já tenho acesso</Link></div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
};

export default Landing;
