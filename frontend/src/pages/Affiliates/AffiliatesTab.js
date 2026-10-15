import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isManager } from "../../utils/access";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Drawer, FormControlLabel, MenuItem, Paper, Switch, TextField, Typography,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import {
  Copy, ExternalLink, FilePlus2, KeyRound, MessageCircle, Pencil, Plus, RefreshCw, Search, Send, Trash2, Trophy, UserPlus, X,
} from "lucide-react";

import GlowCard from "../../components/GlowCard";
import NumberTicker from "../../components/NumberTicker";
import IconAction from "../../components/IconAction";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { BONUS_STATUS, PIX_TYPES, brl, day, fetchAllUsers, initials, useStyles } from "./shared";

const copy = async (text, msg) => {
  try { await navigator.clipboard.writeText(text); toast.success(msg); } catch (e) { toast.error("Não foi possível copiar."); }
};

const EMPTY = { name: "", phone: "", email: "", city: "", document: "", externalLink: "", pixKeyType: "cpf", pixKey: "", poloId: "", ownerId: "", bonusValue: "", status: "active", notes: "" };

const AffiliateForm = ({ open, affiliate, users, polos, canOwner, isAdmin, onClose, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setF(affiliate ? { ...EMPTY, ...Object.fromEntries(Object.entries(affiliate).filter(([, v]) => v !== null)), bonusValue: affiliate.bonusValue ?? "" } : EMPTY);
  }, [open, affiliate]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f };
      if (!isAdmin) delete body.bonusValue;
      const { data } = affiliate ? await api.put(`/affiliates/${affiliate.id}`, body) : await api.post("/affiliates", body);
      toast.success(affiliate ? "Afiliado atualizado." : "Afiliado cadastrado.");
      onSaved(data);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{affiliate ? "Editar afiliado" : "Novo afiliado"}</DialogTitle>
      <DialogContent dividers>
        <TextField label="Nome" value={f.name} onChange={set("name")} fullWidth required margin="dense" variant="outlined" autoFocus />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <TextField label="WhatsApp" value={f.phone} onChange={set("phone")} margin="dense" variant="outlined" placeholder="(69) 99999-0000" helperText="Para enviar o link do portal" />
          <TextField label="E-mail" value={f.email} onChange={set("email")} margin="dense" variant="outlined" />
          <TextField label="Cidade" value={f.city} onChange={set("city")} margin="dense" variant="outlined" />
          <TextField label="CPF ou CNPJ" value={f.document} onChange={set("document")} margin="dense" variant="outlined" />
          <TextField select label="Tipo da chave Pix" value={f.pixKeyType || ""} onChange={set("pixKeyType")} margin="dense" variant="outlined">
            {PIX_TYPES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </TextField>
          <TextField label="Chave Pix" value={f.pixKey} onChange={set("pixKey")} margin="dense" variant="outlined" helperText="Usada quando o pagamento for por Pix" />
          <TextField select label="Polo" value={f.poloId || ""} onChange={set("poloId")} margin="dense" variant="outlined">
            <MenuItem value="">Sem polo</MenuItem>
            {polos.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          {canOwner && (
            <TextField select label="Consultor responsável" value={f.ownerId || ""} onChange={set("ownerId")} margin="dense" variant="outlined">
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
            </TextField>
          )}
          {isAdmin && (
            <TextField label="Bonificação própria (R$)" value={f.bonusValue} onChange={set("bonusValue")} margin="dense" variant="outlined" type="number" helperText="Vazio usa a regra geral ou da campanha" />
          )}
        </div>
        <TextField label="Link do afiliado no app Minhas indicações" value={f.externalLink || ""} onChange={set("externalLink")} fullWidth margin="dense" variant="outlined"
          placeholder="https://..." helperText="Guarde aqui o link para não perder e usar quando for indicar" />
        <TextField label="Observações" value={f.notes || ""} onChange={set("notes")} fullWidth multiline rows={2} margin="dense" variant="outlined" />
        {affiliate && (
          <FormControlLabel
            control={<Switch color="primary" checked={f.status === "active"} onChange={(e) => setF((x) => ({ ...x, status: e.target.checked ? "active" : "paused" }))} />}
            label={f.status === "active" ? "Ativo: o link do portal funciona" : "Pausado: o link do portal fica bloqueado"}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button color="primary" variant="contained" disabled={busy || f.name.trim().length < 2} onClick={save}>Salvar</Button>
      </DialogActions>
    </Dialog>
  );
};

const ReferralDialog = ({ open, affiliate, courses, onClose, onDone }) => {
  const [f, setF] = useState({ name: "", phone: "", courseId: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: "", phone: "", courseId: "" }); }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/affiliates/${affiliate.id}/referrals`, { ...f, courseId: f.courseId || undefined });
      toast.success(data.created ? "Indicado cadastrado para este afiliado." : "Essa pessoa já estava no CRM; nada foi duplicado.");
      onDone(data);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nova indicação de {affiliate && affiliate.name.split(" ")[0]}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          O lead fica com você e conta na produção do afiliado. Depois é só gerar a proposta e enviar o link para ele repassar.
        </Typography>
        <TextField label="Nome do indicado" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} fullWidth margin="dense" variant="outlined" autoFocus />
        <TextField label="WhatsApp do indicado" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} fullWidth margin="dense" variant="outlined" placeholder="(69) 99999-0000" />
        <Autocomplete
          options={courses}
          getOptionLabel={(c) => `${c.name}${c.modality ? ` · ${c.modality}` : ""}`}
          onChange={(e, v) => setF({ ...f, courseId: v ? v.id : "" })}
          renderInput={(p) => <TextField {...p} label="Curso de interesse" margin="dense" variant="outlined" />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button color="primary" variant="contained" disabled={busy || f.name.trim().length < 2 || !f.phone} onClick={go}>Cadastrar e abrir o lead</Button>
      </DialogActions>
    </Dialog>
  );
};

const AffiliateDrawer = ({ id, canOwner, isAdmin, users, polos, courses, onClose, onChanged }) => {
  const classes = useStyles();
  const history = useHistory();
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(false);
  const [referral, setReferral] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [remove, setRemove] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    api.get(`/affiliates/${id}/summary`).then(({ data: d }) => setData(d)).catch(toastError);
  }, [id]);
  useEffect(() => { setData(null); load(); }, [load]);

  const a = data && data.affiliate;
  const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); load(); onChanged(); } catch (err) { toastError(err); } };

  return (
    <Drawer anchor="right" open={!!id} onClose={onClose} PaperProps={{ className: classes.drawer }}>
      {a ? (
        <>
          <div className={classes.drawerHead}>
            <span className={classes.avatar}>{initials(a.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={classes.name}>{a.name}</div>
              <div className={classes.sub}>{a.owner ? `Consultor: ${a.owner.name}` : "Sem consultor"}{a.city ? ` · ${a.city}` : ""}</div>
            </div>
            {a.status === "paused" && <span className={classes.chip} style={{ background: "rgba(220,38,38,.14)", color: "#b91c1c" }}>Pausado</span>}
            <IconAction title="Editar dados" onClick={() => setEdit(true)}><Pencil size={17} /></IconAction>
            <IconAction title="Fechar" onClick={onClose}><X size={18} /></IconAction>
          </div>

          <div className={classes.drawerBody}>
            <div className={classes.section}>
              <div className={classes.sectionTitle}>Acesso do afiliado</div>
              <div className={classes.linkBox}>
                <KeyRound size={16} />
                <code title={a.portalUrl}>{a.portalUrl}</code>
                <IconAction title="Copiar link do portal" onClick={() => copy(a.portalUrl, "Link do portal copiado.")}><Copy size={16} /></IconAction>
                <IconAction title="Abrir o portal como o afiliado vê" onClick={() => window.open(a.portalUrl, "_blank", "noopener")}><ExternalLink size={16} /></IconAction>
              </div>
              <Typography variant="caption" color="textSecondary">Sem senha: quem tem o link entra. Envie só para o afiliado e troque o link se ele vazar.</Typography>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Button size="small" variant="contained" color="primary" startIcon={<MessageCircle size={15} />} disabled={!a.phone}
                  onClick={() => run(() => api.post(`/affiliates/${a.id}/send-portal`), "Link enviado pelo WhatsApp.")}>Enviar por WhatsApp</Button>
                <Button size="small" variant="outlined" disabled={!a.email}
                  onClick={() => run(() => api.post(`/affiliates/${a.id}/send-access-email`), "Acesso enviado por e-mail.")}>Enviar por e-mail</Button>
                <Button size="small" variant="outlined" startIcon={<RefreshCw size={15} />} onClick={() => setRotate(true)}>Trocar o link</Button>
              </div>
              {(!a.phone || !a.email) && <Typography variant="caption" color="textSecondary" display="block" style={{ marginTop: 6 }}>{!a.phone && !a.email ? "Cadastre o WhatsApp ou o e-mail para enviar." : !a.phone ? "Cadastre o WhatsApp para enviar por lá." : "Cadastre o e-mail para enviar por e-mail."}</Typography>}
              {a.externalLink && (
                <>
                  <div className={classes.sectionTitle} style={{ marginTop: 16 }}>Link no app Minhas indicações</div>
                  <div className={classes.linkBox}>
                    <code title={a.externalLink}>{a.externalLink}</code>
                    <IconAction title="Copiar o link" onClick={() => copy(a.externalLink, "Link copiado.")}><Copy size={16} /></IconAction>
                    <IconAction title="Abrir o link" onClick={() => window.open(a.externalLink, "_blank", "noopener")}><ExternalLink size={16} /></IconAction>
                  </div>
                  <Button size="small" variant="outlined" style={{ marginTop: 8 }} startIcon={<Send size={14} />}
                    onClick={() => copy(`Olá! Se você quer estudar com a gente, fale por este link: ${a.externalLink}`, "Mensagem de indicação copiada. É só colar na conversa.")}>
                    Copiar mensagem para indicar
                  </Button>
                </>
              )}
              <div className={classes.sectionTitle} style={{ marginTop: 16 }}>Link de indicação (formulário público)</div>
              <div className={classes.linkBox}>
                <code title={a.referralUrl}>{a.referralUrl}</code>
                <IconAction title="Copiar link de indicação" onClick={() => copy(a.referralUrl, "Link de indicação copiado.")}><Copy size={16} /></IconAction>
              </div>
            </div>

            <div className={classes.section}>
              <div className={classes.sectionTitle}>Produção</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[["Indicados", a.stats.referrals], ["Propostas", a.stats.proposals], ["Matrículas", a.stats.enrolled], ["Conversão", `${a.stats.conversion}%`]].map(([l, v]) => (
                  <GlowCard key={l} className={classes.kpi} style={{ padding: 10 }}><div className={classes.kpiValue} style={{ fontSize: 20 }}>{v}</div><div className={classes.kpiLabel}>{l}</div></GlowCard>
                ))}
              </div>
              <Typography variant="body2" style={{ marginTop: 8 }}>
                Bonificação: <b>{brl(a.stats.bonusPending + a.stats.bonusApproved)}</b> a pagar · <b>{brl(a.stats.bonusPaid)}</b> paga
              </Typography>
            </div>

            <div className={classes.section}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <div className={classes.sectionTitle} style={{ margin: 0, flex: 1 }}>Indicados ({data.leads.length})</div>
                <Button size="small" variant="outlined" startIcon={<UserPlus size={15} />} onClick={() => setReferral(true)}>Nova indicação</Button>
              </div>
              {data.leads.length === 0 && <Typography variant="body2" color="textSecondary">Ninguém indicado ainda. Cadastre uma indicação ou envie o link ao afiliado.</Typography>}
              {data.leads.map((l) => (
                <div key={l.id} className={classes.mini} style={{ cursor: "pointer" }} onClick={() => history.push(`/crm?lead=${l.id}`)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={classes.name}>{l.name}</div>
                    <div className={classes.sub}>{l.course ? l.course.name : "Sem curso"} · {day(l.createdAt)}</div>
                  </div>
                  {l.stage && <span className={classes.chip} style={{ background: `${l.stage.color}22`, color: l.stage.color }}>{l.stage.name}</span>}
                </div>
              ))}
            </div>

            <div className={classes.section}>
              <div className={classes.sectionTitle}>Propostas geradas ({data.proposals.length})</div>
              {data.proposals.length === 0 && <Typography variant="body2" color="textSecondary">Abra um indicado e gere a proposta na aba Propostas. Ela aparece aqui para você enviar ao afiliado.</Typography>}
              {data.proposals.map((p) => (
                <div key={p.id} className={classes.mini}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={classes.name}>{p.courseName}</div>
                    <div className={classes.sub}>{(data.leads.find((l) => l.id === p.leadId) || {}).name || `Lead ${p.leadId}`} · {p.viewedAt ? `vista em ${day(p.viewedAt)}` : p.status === "sent" ? "enviada, ainda não vista" : "rascunho"}</div>
                  </div>
                  <IconAction title="Copiar link da proposta" onClick={() => copy(p.publicUrl, "Link da proposta copiado.")}><Copy size={16} /></IconAction>
                  <IconAction title="Enviar ao afiliado por WhatsApp para ele repassar" disabled={!a.phone}
                    onClick={() => run(() => api.post(`/affiliates/${a.id}/send-proposal`, { proposalId: p.id }), "Proposta enviada ao afiliado.")}><Send size={16} /></IconAction>
                </div>
              ))}
            </div>

            <div className={classes.section}>
              <div className={classes.sectionTitle}>Bonificações</div>
              {data.bonuses.length === 0 && <Typography variant="body2" color="textSecondary">Aparecem aqui quando um indicado se matricular.</Typography>}
              {data.bonuses.map((b) => {
                const st = BONUS_STATUS[b.status] || BONUS_STATUS.pending;
                return (
                  <div key={b.id} className={classes.mini}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={classes.name}>{brl(b.amount)} · {b.lead ? b.lead.name : ""}</div>
                      <div className={classes.sub}>{b.reason}</div>
                    </div>
                    <span className={classes.chip} style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                );
              })}
            </div>

            {isAdmin && (
              <Button size="small" startIcon={<Trash2 size={15} />} style={{ color: "#dc2626" }} onClick={() => setRemove(true)}>Excluir afiliado</Button>
            )}
          </div>

          <AffiliateForm open={edit} affiliate={a} users={users} polos={polos} canOwner={canOwner} isAdmin={isAdmin}
            onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); onChanged(); }} />
          <ReferralDialog open={referral} affiliate={a} courses={courses} onClose={() => setReferral(false)}
            onDone={(r) => { setReferral(false); load(); onChanged(); history.push(`/crm?lead=${r.lead.id}`); }} />
          <ConfirmationModal open={rotate} onClose={setRotate} title="Trocar o link do portal?"
            onConfirm={() => run(() => api.post(`/affiliates/${a.id}/rotate-token`), "Link trocado. O antigo parou de funcionar.")}>
            O link atual deixa de funcionar na hora. Você precisará enviar o novo ao afiliado.
          </ConfirmationModal>
          <ConfirmationModal open={remove} onClose={setRemove} title="Excluir afiliado?"
            onConfirm={async () => { try { await api.delete(`/affiliates/${a.id}`); toast.success("Afiliado excluído."); onChanged(); onClose(); } catch (err) { toastError(err); } }}>
            Os leads continuam no CRM, mas deixam de ser creditados a ele. Prefere só pausar? Edite o afiliado e desligue “Ativo”.
          </ConfirmationModal>
        </>
      ) : <div className={classes.empty}>Carregando...</div>}
    </Drawer>
  );
};

const AffiliatesTab = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isAdmin = isManager(user);
  const canOwner = isAdmin || user.role === "coordenacao";
  const [rows, setRows] = useState([]);
  const [rank, setRank] = useState(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [form, setForm] = useState(false);
  const [users, setUsers] = useState([]);
  const [polos, setPolos] = useState([]);
  const [courses, setCourses] = useState([]);

  const load = useCallback(() => {
    Promise.all([
      api.get("/affiliates", { params: { days } }),
      api.get("/affiliates/ranking", { params: { days, by: "paid" } }),
    ]).then(([a, r]) => { setRows(a.data); setRank(r.data); }).catch(toastError).finally(() => setLoading(false));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/courses").then(({ data }) => setCourses(data.filter((c) => c.active))).catch(() => undefined);
    api.get("/affiliates/polos").then(({ data }) => setPolos(data)).catch(() => undefined);
    if (canOwner) fetchAllUsers().then((list) => setUsers(list.filter((u) => u.role !== "tutor"))).catch(() => undefined);
  }, [canOwner]);

  useEffect(() => {
    const socket = openSocket();
    socket.on("affiliate", load);
    socket.on("affiliateBonus", load);
    return () => socket.disconnect();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((a) => !q || `${a.name} ${a.city || ""} ${a.refCode} ${a.owner ? a.owner.name : ""}`.toLowerCase().includes(q));
  }, [rows, search]);

  const top = rank && rank.affiliates[0] && rank.affiliates[0].enrolled > 0 ? rank.affiliates[0] : null;

  return (
    <div className={classes.page}>
      <div className={classes.kpis}>
        {[["Afiliados", rows.length, null], ["Indicados", rank ? rank.totals.referrals : 0, null], ["Matrículas", rank ? rank.totals.enrolled : 0, null], ["Bonificação a pagar", rank ? rank.totals.bonusOwed : 0, brl]].map(([l, v, fmt], i) => (
          <GlowCard key={l} className={classes.kpi} style={{ animationDelay: `${i * 60}ms` }}>
            <div className={classes.kpiValue}><NumberTicker value={v} format={fmt} /></div>
            <div className={classes.kpiLabel}>{l}{l !== "Afiliados" ? ` · ${days} dias` : ""}</div>
          </GlowCard>
        ))}
        {rank && (
          <GlowCard className={classes.kpi} style={{ animationDelay: "200ms" }}>
            <div className={classes.kpiValue}><NumberTicker value={rank.totals.bonusPaid || 0} format={brl} /></div>
            <div className={classes.kpiLabel}>Já pago · {days} dias</div>
          </GlowCard>
        )}
        {top && (
          <GlowCard className={classes.kpi} style={{ animationDelay: "240ms" }}>
            <div className={classes.kpiValue} style={{ fontSize: 17, display: "flex", gap: 6, alignItems: "center" }}><Trophy size={18} color="#d97706" />{top.name.split(" ")[0]}</div>
            <div className={classes.kpiLabel}>mais matrículas · {top.enrolled}</div>
          </GlowCard>
        )}
      </div>

      {rank && rank.affiliates.some((a) => a.bonusPaid + a.bonusPending + a.bonusApproved > 0) && (
        <Paper variant="outlined" style={{ padding: 16, margin: "0 0 12px", animation: "page-in .4s var(--ease-out) both" }}>
          <Typography variant="subtitle2" style={{ fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}><Trophy size={16} color="#d97706" /> Quem mais recebeu · {days} dias</Typography>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {rank.affiliates.filter((a) => a.bonusPaid + a.bonusPending + a.bonusApproved > 0).slice(0, 5).map((a, i) => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto auto", gap: 10, alignItems: "baseline", fontSize: 14 }}>
                <b>{i + 1}</b>
                <span>{a.name}<span style={{ opacity: 0.6 }}>{a.owner ? ` · ${a.owner}` : ""}</span></span>
                <span style={{ fontWeight: 700 }}>{brl(a.bonusPaid)} <span style={{ fontWeight: 400, opacity: 0.6 }}>pagos</span></span>
                <span style={{ opacity: 0.75 }}>{brl(a.bonusPending + a.bonusApproved)} a pagar</span>
              </div>
            ))}
          </div>
        </Paper>
      )}

      <div className={classes.toolbar}>
        <TextField className={classes.grow} size="small" variant="outlined" placeholder="Buscar por nome, cidade, código ou consultor" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.6 }} /> }} />
        <TextField select size="small" variant="outlined" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ minWidth: 140 }}>
          {[[30, "Últimos 30 dias"], [90, "Últimos 90 dias"], [365, "Último ano"]].map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        <Button variant="contained" color="primary" startIcon={<Plus size={16} />} onClick={() => setForm(true)}>Novo afiliado</Button>
      </div>

      <div className={classes.body}>
        {!loading && shown.length === 0 && (
          <Paper variant="outlined" className={classes.empty}>
            <FilePlus2 size={36} style={{ opacity: 0.6 }} />
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>{rows.length ? "Nenhum afiliado com essa busca" : "Cadastre o primeiro afiliado"}</Typography>
            <Typography variant="body2">{rows.length ? "Tente outro nome ou limpe a busca." : "Cada afiliado ganha um link para baixar o material e acompanhar as próprias indicações."}</Typography>
          </Paper>
        )}
        <div className={classes.list}>
          {shown.map((a, i) => (
            <GlowCard key={a.id} className={classes.row} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => setOpenId(a.id)}>
              <span className={classes.avatar}>{initials(a.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div className={classes.name}>{a.name}</div>
                <div className={classes.sub}>{a.owner ? a.owner.name : "Sem consultor"}{a.city ? ` · ${a.city}` : ""} · código {a.refCode}</div>
              </div>
              <div className={classes.rowStats}>
                <span className={classes.stat}><b>{a.stats.referrals}</b><span>indicados</span></span>
                <span className={classes.stat}><b>{a.stats.proposals}</b><span>propostas</span></span>
                <span className={classes.stat}><b>{a.stats.enrolled}</b><span>matrículas</span></span>
                <span className={classes.stat}><b>{brl(a.stats.bonusPending + a.stats.bonusApproved)}</b><span>a pagar</span></span>
                <span className={classes.stat}><b>{brl(a.stats.bonusPaid)}</b><span>recebido</span></span>
              </div>
              {a.status === "paused" ? <span className={classes.chip} style={{ background: "rgba(220,38,38,.14)", color: "#b91c1c" }}>Pausado</span> : <span />}
            </GlowCard>
          ))}
        </div>
      </div>

      <AffiliateForm open={form} affiliate={null} users={users} polos={polos} canOwner={canOwner} isAdmin={isAdmin}
        onClose={() => setForm(false)} onSaved={(a) => { setForm(false); load(); setOpenId(a.id); }} />
      <AffiliateDrawer id={openId} canOwner={canOwner} isAdmin={isAdmin} users={users} polos={polos} courses={courses}
        onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
};

export default AffiliatesTab;
