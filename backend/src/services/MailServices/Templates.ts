const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// The password recovery message: the link is valid for a short time and only once.
export const resetPasswordMail = (name: string, link: string, minutes: number): { subject: string; text: string; html: string } => {
  const first = (name || "").trim().split(/\s+/)[0] || "";
  const hello = first ? `Olá, ${first}!` : "Olá!";
  const text = `${hello}\n\nRecebemos um pedido para criar uma nova senha no Chat Acadêmico.\n\nAbra este link para escolher a nova senha (vale por ${minutes} minutos e só pode ser usado uma vez):\n${link}\n\nSe você não pediu, ignore esta mensagem: a sua senha continua a mesma.\n\nCruzeiro do Sul Virtual`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#17202b">
  <div style="background:#0B4279;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Chat Acadêmico</div>
  <div style="border:1px solid #dbe3ee;border-top:0;padding:22px;border-radius:0 0 12px 12px;line-height:1.5">
    <p style="margin:0 0 12px">${escapeHtml(hello)}</p>
    <p style="margin:0 0 18px">Recebemos um pedido para criar uma nova senha. O link vale por <b>${minutes} minutos</b> e só pode ser usado uma vez.</p>
    <p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="background:#0B4279;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:700">Criar nova senha</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#566577">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${escapeHtml(link)}</span></p>
    <p style="margin:14px 0 0;font-size:13px;color:#566577">Se você não pediu, ignore esta mensagem: a sua senha continua a mesma.</p>
  </div></div>`;
  return { subject: "Chat Acadêmico: crie uma nova senha", text, html };
};

export const testMail = (): { subject: string; text: string; html: string } => ({
  subject: "Chat Acadêmico: e-mail de teste",
  text: "Este é um e-mail de teste do Chat Acadêmico. Se você recebeu, o envio de e-mails está funcionando.",
  html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto"><p><b>Chat Acadêmico</b></p><p>Este é um e-mail de teste. Se você recebeu, o envio de e-mails está funcionando. ✅</p></div>`
});
