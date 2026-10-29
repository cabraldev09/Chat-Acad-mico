import React from "react";
import { Link } from "react-router-dom";

import SiteShell, { useMeta } from "./Shell";
import { SITE, contactHref, hasContact } from "./config";

const css = `
.sg-wrap{width:min(820px,100% - 40px);margin:0 auto;padding:56px 0 0}
.sg-wrap h1{font-size:clamp(30px,5vw,44px);letter-spacing:-.035em;line-height:1.08;margin:0}
.sg-meta{color:#5d6f86;font-size:14.5px;margin:12px 0 0}
.sg-wrap h2{font-size:22px;letter-spacing:-.02em;margin:40px 0 0}
.sg-wrap h3{font-size:17px;margin:22px 0 0}
.sg-wrap p,.sg-wrap li{font-size:16.5px;color:#2b3a52}
.sg-wrap p{margin:12px 0 0}
.sg-wrap ul{margin:10px 0 0;padding-left:22px;display:grid;gap:6px}
.sg-wrap a{color:#0b4279;font-weight:600}
.sg-box{border:1px solid #d9e1ec;border-radius:12px;padding:16px 18px;margin-top:20px;background:#f7f9fc}
.sg-toc{margin-top:24px;columns:2;column-gap:32px;font-size:15px}
@media(max-width:600px){.sg-toc{columns:1}}
`;

const who = () => SITE.company || `a empresa responsável pelo ${SITE.name}`;
const contact = (subject) => (hasContact ? <a href={contactHref(subject)}>{SITE.email || "WhatsApp"}</a> : <span>o contato informado pelo seu administrador no sistema</span>);

const Legal = ({ title, description, children }) => {
  useMeta(`${title} — ${SITE.name}`, description);
  return (
    <SiteShell>
      <style>{css}</style>
      <article className="sg-wrap">
        <h1>{title}</h1>
        <p className="sg-meta">Última atualização: {SITE.updatedAt}</p>
        {children}
      </article>
    </SiteShell>
  );
};

export const Privacy = () => (
  <Legal title="Política de Privacidade" description="Como o Chat Acadêmico trata dados pessoais: o que coleta, para quê, com quem compartilha, por quanto tempo guarda e como você exerce seus direitos pela LGPD.">
    <p>Esta política explica como o {SITE.name} trata dados pessoais. O {SITE.name} é um sistema de atendimento e CRM usado por instituições de ensino para conversar com pessoas interessadas em estudar e com alunos pelo WhatsApp, Instagram, Messenger e Telegram. Ele é oferecido por {who()}{SITE.cnpj ? ` (CNPJ ${SITE.cnpj})` : ""}.</p>
    <div className="sg-box">
      <b>Quem é quem.</b> Cada instituição que usa o sistema decide para que usa os dados das suas conversas e é a <b>controladora</b> desses dados (Lei nº 13.709/2018, LGPD). {who()} atua como <b>operadora</b>: trata os dados em nome da instituição, apenas para prestar o serviço. Sobre os dados de quem acessa o sistema (usuários) e de quem visita este site, {who()} é a controladora.
    </div>

    <h2>1. Dados que tratamos</h2>
    <h3>Das pessoas que conversam com uma instituição</h3>
    <ul>
      <li>Identificação e contato: nome, número de telefone, nome e identificador do perfil no Instagram, Messenger ou Telegram, foto do perfil quando o canal a fornece, e-mail e cidade, quando a pessoa informa.</li>
      <li>O conteúdo das conversas: mensagens, áudios, imagens, documentos e reações trocados com a instituição.</li>
      <li>Dados do interesse: curso, polo, tipo de ingresso, etapa do atendimento, tarefas e anotações da equipe.</li>
      <li>Documentos que a pessoa envia, como o histórico escolar para análise de transferência, e os dados da matrícula, quando ela decide se matricular.</li>
      <li>Origem do contato: página, campanha ou anúncio de onde veio, quando a instituição usa essas marcações.</li>
    </ul>
    <h3>De quem usa o sistema (equipe da instituição)</h3>
    <ul>
      <li>Nome, e-mail, perfil de acesso, polo e equipe; registros de acesso e de ações no sistema (para segurança e auditoria).</li>
    </ul>
    <h3>De quem visita este site</h3>
    <ul>
      <li>Dados técnicos de navegação (endereço IP, navegador, páginas acessadas) e, se você pedir uma demonstração, o nome e o contato que você enviar.</li>
    </ul>

    <h2>2. Para que usamos</h2>
    <ul>
      <li>Receber, organizar e responder as conversas, e transferir cada atendimento para a equipe ou o polo certo.</li>
      <li>Operar o funil de matrículas, as tarefas e os lembretes de retorno, e gerar relatórios para a instituição.</li>
      <li>Responder automaticamente por meio de uma assistente virtual, quando a instituição a ativa. A assistente se apresenta como assistente virtual e passa a conversa para uma pessoa quando a pessoa pede ou quando o assunto exige.</li>
      <li>Enviar mensagens de campanha, lembretes e pesquisas apenas a quem a instituição pode contatar, respeitando o pedido de quem não quer receber.</li>
      <li>Manter a segurança do sistema, prevenir fraudes e cumprir obrigações legais.</li>
    </ul>
    <p>As bases legais usadas são, conforme o caso, a execução de procedimentos preliminares ou de contrato a pedido da pessoa (por exemplo, a matrícula), o consentimento, o legítimo interesse da instituição em atender quem a procurou, e o cumprimento de obrigação legal.</p>

    <h2>3. Dados recebidos das plataformas da Meta</h2>
    <p>Quando uma instituição conecta o WhatsApp Business, o Instagram ou o Messenger, o {SITE.name} recebe da Meta, pelas APIs oficiais e com as permissões autorizadas pela própria instituição, as mensagens enviadas e recebidas naquele canal e os dados básicos do remetente (nome, identificador e foto de perfil, quando disponíveis). Usamos esses dados <b>somente</b> para:</p>
    <ul>
      <li>mostrar as conversas à equipe da instituição e permitir que ela responda;</li>
      <li>enviar as respostas e mensagens que a instituição escolhe enviar, dentro das regras de uso e das janelas de atendimento da Meta;</li>
      <li>registrar o histórico do atendimento e atualizar o CRM da instituição.</li>
    </ul>
    <p>Não vendemos dados recebidos da Meta, não os usamos para publicidade nem para criar perfis de pessoas fora do atendimento da própria instituição, e não os transferimos a terceiros além dos prestadores descritos na seção 4. As credenciais de acesso aos canais são guardadas com criptografia.</p>

    <h2>4. Com quem compartilhamos</h2>
    <ul>
      <li><b>A instituição</b> que você contatou e a sua equipe autorizada.</li>
      <li><b>Meta Platforms</b>, quando uma conversa passa pelo WhatsApp, Instagram ou Messenger, segundo a política da própria Meta.</li>
      <li><b>Provedores de infraestrutura</b> que hospedam o sistema e o banco de dados e prestadores de envio de e-mail.</li>
      <li><b>Provedores de inteligência artificial</b> (por exemplo, Anthropic ou OpenAI), apenas quando a instituição ativa a assistente virtual: o texto da conversa necessário para gerar a resposta é enviado ao provedor escolhido, sob contrato, e não é usado por nós para outras finalidades. Ao analisar arquivos para treinar a assistente, telefones, CPF e e-mails são ocultados antes do envio.</li>
      <li><b>Autoridades</b>, quando houver obrigação legal ou ordem judicial.</li>
    </ul>
    <p>Alguns desses prestadores podem processar dados fora do Brasil. Nesses casos, adotamos as garantias previstas na LGPD para a transferência internacional.</p>

    <h2>5. Por quanto tempo guardamos</h2>
    <p>Guardamos os dados enquanto a instituição usar o sistema e pelo tempo necessário para as finalidades acima e para cumprir obrigações legais. Encerrado o contrato, os dados são devolvidos à instituição e excluídos em prazo razoável, salvo o que a lei exigir guardar. Pedidos de exclusão são tratados conforme a seção 7.</p>

    <h2>6. Segurança</h2>
    <ul>
      <li>Conexão criptografada (HTTPS) e credenciais de canais e chaves de integração guardadas com criptografia.</li>
      <li>Perfis de acesso por função (administrador, coordenação, consultor e tutor): cada pessoa vê apenas o que o seu papel permite.</li>
      <li>Registro de ações e histórico de alterações da assistente virtual, que podem ser restauradas.</li>
    </ul>
    <p>Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente que possa trazer risco relevante, comunicaremos a instituição e, quando aplicável, a ANPD, nos termos da lei.</p>

    <h2>7. Seus direitos</h2>
    <p>Você pode pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados fora da lei; portabilidade; informação sobre com quem compartilhamos; revogação do consentimento; e revisão de decisões tomadas apenas de forma automatizada. Para pedir a exclusão, siga as instruções em <Link to="/exclusao-de-dados">Exclusão de dados</Link>. Para os demais pedidos, fale com {contact("Pedido sobre meus dados pessoais")}. Como a instituição é a controladora, podemos encaminhar o pedido a ela e acompanhar a resposta.</p>
    <p>Para parar de receber mensagens, responda “SAIR” na própria conversa ou peça à instituição.</p>

    <h2>8. Cookies</h2>
    <p>Este site usa apenas o armazenamento necessário para funcionar. O sistema, depois do login, guarda no navegador a sessão e preferências da sua conta (por exemplo, tema e filtros). Não usamos cookies de publicidade neste site.</p>

    <h2>9. Crianças e adolescentes</h2>
    <p>O sistema é destinado a instituições de ensino superior e a pessoas maiores de 18 anos. Se uma instituição atender menores, ela é responsável por obter o consentimento de um responsável legal.</p>

    <h2>10. Contato e alterações</h2>
    <p>Dúvidas sobre esta política ou sobre o tratamento de dados: {contact("Privacidade")}.{SITE.address ? ` Endereço: ${SITE.address}.` : ""} Podemos atualizar esta política; a data no topo mostra a versão em vigor, e mudanças relevantes serão avisadas no sistema.</p>
  </Legal>
);

export const Terms = () => (
  <Legal title="Termos de Uso" description="Condições para usar o Chat Acadêmico: quem pode usar, responsabilidades da instituição, uso aceitável dos canais da Meta, assistente virtual, pagamento e encerramento.">
    <p>Estes termos regulam o uso do {SITE.name}, sistema de atendimento e CRM oferecido por {who()}{SITE.cnpj ? ` (CNPJ ${SITE.cnpj})` : ""} a instituições de ensino. Ao criar uma conta ou usar o sistema, a instituição e as pessoas que ela autoriza concordam com estas condições.</p>

    <h2>1. O serviço</h2>
    <p>O {SITE.name} reúne conversas de WhatsApp, Instagram, Messenger e Telegram, organiza o funil de matrículas, oferece uma assistente virtual configurável, campanhas, fluxos, relatórios e áreas de pós-matrícula. Os recursos podem mudar ao longo do tempo.</p>

    <h2>2. Conta e acesso</h2>
    <ul>
      <li>O acesso é feito por pessoas autorizadas pelo administrador da instituição, com login e senha pessoais e intransferíveis.</li>
      <li>A instituição responde pelas contas que cria, pelos perfis de acesso que concede e por manter os dados de cadastro corretos.</li>
      <li>Avise-nos assim que suspeitar de uso indevido de uma conta.</li>
    </ul>

    <h2>3. Responsabilidades da instituição</h2>
    <ul>
      <li>Ter base legal para tratar os dados das pessoas que atende e para enviar mensagens a elas, respeitando a LGPD e o pedido de quem não quer receber contato.</li>
      <li>Cumprir os termos e as políticas da Meta (WhatsApp Business, Instagram e Messenger) e do Telegram, incluindo as regras de modelos de mensagem e de janelas de atendimento.</li>
      <li>Revisar e aprovar o que a assistente virtual pode dizer. O conteúdo cadastrado (cursos, grades, textos institucionais) é de responsabilidade da instituição.</li>
      <li>Não usar o sistema para spam, golpes, conteúdo ilegal, discriminatório ou enganoso, nem para coletar dados sem autorização.</li>
    </ul>

    <h2>4. Assistente virtual</h2>
    <p>A assistente usa inteligência artificial e pode errar. Ela foi desenhada para falar apenas do que está cadastrado, não prometer valores, bolsas ou prazos e passar a conversa para uma pessoa quando necessário, mas a instituição deve acompanhar os atendimentos e corrigir o que for preciso. As respostas da assistente não substituem a decisão ou a confirmação da equipe.</p>

    <h2>5. Propriedade e dados</h2>
    <p>O sistema e sua marca pertencem a {who()}. Os dados e conteúdos inseridos pela instituição continuam sendo dela, e ela pode exportá-los e pedir a exclusão. Tratamos esses dados conforme a <Link to="/privacidade">Política de Privacidade</Link>.</p>

    <h2>6. Disponibilidade</h2>
    <p>Trabalhamos para manter o sistema disponível, mas ele depende de serviços de terceiros (Meta, Telegram, provedores de nuvem e de IA) e pode ter interrupções, manutenções e limites impostos por eles. Não garantimos funcionamento ininterrupto.</p>

    <h2>7. Preço e pagamento</h2>
    <p>Valores, prazos e forma de pagamento são combinados na proposta comercial. Atrasos podem levar à suspensão do acesso, com aviso prévio.</p>

    <h2>8. Suspensão e encerramento</h2>
    <p>A instituição pode encerrar o uso quando quiser, na forma prevista na proposta. Podemos suspender o acesso em caso de violação destes termos, de risco à segurança ou de ordem legal. Ao encerrar, a instituição pode exportar seus dados antes da exclusão.</p>

    <h2>9. Limitação de responsabilidade</h2>
    <p>Na extensão permitida pela lei, {who()} não responde por danos indiretos, lucros cessantes ou perdas decorrentes de conteúdo cadastrado pela instituição, de indisponibilidade de serviços de terceiros ou de uso do sistema em desacordo com estes termos.</p>

    <h2>10. Alterações, lei aplicável e contato</h2>
    <p>Podemos atualizar estes termos e avisaremos sobre mudanças relevantes. Aplica-se a lei brasileira. Dúvidas: {contact("Termos de uso")}.</p>
  </Legal>
);

export const DataDeletion = () => (
  <Legal title="Exclusão de dados" description="Como pedir a exclusão dos seus dados pessoais tratados pelo Chat Acadêmico, inclusive os recebidos pelo WhatsApp, Instagram e Messenger.">
    <p>Você pode pedir a exclusão dos dados pessoais que o {SITE.name} guarda sobre você, inclusive conversas e dados de perfil recebidos pelo WhatsApp, Instagram, Messenger ou Telegram.</p>

    <h2>Como pedir</h2>
    <ol style={{ margin: "10px 0 0", paddingLeft: 22, display: "grid", gap: 8, fontSize: 16.5, color: "#2b3a52" }}>
      <li>Envie o pedido para {contact("Exclusão de dados")} com o assunto “Exclusão de dados”.</li>
      <li>Informe o canal e o dado pelo qual você fala com a instituição: o número de telefone (com DDD) do WhatsApp, o nome de usuário do Instagram ou do Messenger, ou o seu nome no Telegram, e o nome da instituição com quem você conversou.</li>
      <li>Para a sua segurança, podemos pedir uma confirmação de que o pedido é seu, respondendo pelo mesmo canal.</li>
    </ol>

    <h2>O que acontece depois</h2>
    <ul>
      <li>Respondemos confirmando o recebimento em até 5 dias úteis e concluímos a exclusão em até 30 dias.</li>
      <li>Excluímos as conversas, os dados de contato, as anotações e os documentos ligados a você. Como a instituição é a controladora dos dados, podemos encaminhar o pedido a ela e acompanhar o atendimento.</li>
      <li>Alguns dados podem ser mantidos pelo tempo que a lei exigir (por exemplo, registros de matrícula e obrigações fiscais). Nesse caso explicamos o motivo.</li>
    </ul>

    <h2>Quem usa o Facebook, o Instagram ou o WhatsApp</h2>
    <p>Se você removeu o {SITE.name} das configurações do seu perfil na Meta, ou quer apagar os dados que recebemos por esses canais, o procedimento é o mesmo descrito acima. Os dados que a própria Meta guarda sobre você são geridos por ela, nas configurações da sua conta.</p>

    <h2>Se você é da equipe de uma instituição</h2>
    <p>Peça ao administrador da sua instituição para excluir ou anonimizar o seu usuário. Ele consegue fazer isso no sistema.</p>

    <div className="sg-box">Dúvidas? Veja a <Link to="/privacidade">Política de Privacidade</Link> ou fale com {contact("Exclusão de dados")}.</div>
  </Legal>
);
