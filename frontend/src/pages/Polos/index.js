import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Switch,
  FormControlLabel, Typography, CircularProgress, Avatar,
} from "@material-ui/core";
import { Autocomplete } from "@material-ui/lab";
import { Upload } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ImportWizard from "../../components/ImportWizard";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const FUNCTIONS = [
  { key: "comercial", label: "Comercial", hint: "Consultores que atendem candidatos e geram propostas." },
  { key: "tutoria", label: "Tutoria", hint: "Tutores que ambientam o aluno na plataforma. Pode haver mais de um." },
  { key: "academico", label: "Setor acadêmico", hint: "Secretaria e suporte acadêmico do polo." },
  { key: "coordenacao", label: "Coordenação acadêmica", hint: "Acompanha o polo (leitura)." },
];

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const ROLE_LABEL = { admin: "Administrador", coordenacao: "Coordenação", consultor: "Consultor", tutor: "Tutor", academico: "Acadêmico" };

const DISTRIBUTION = [
  { value: "none", label: "Manual (cada um assume)" },
  { value: "roundrobin", label: "Rodízio entre a equipe" },
  { value: "least", label: "Quem tem menos atendimentos" },
];

const useStyles = makeStyles((theme) => ({
  grid: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", padding: theme.spacing(0.5, 0, 3) },
  card: { borderRadius: 16, border: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper, padding: theme.spacing(2.25), display: "flex", flexDirection: "column", gap: theme.spacing(1.25) },
  head: { display: "flex", alignItems: "flex-start", gap: theme.spacing(1) },
  name: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" },
  meta: { fontSize: 13, color: theme.palette.text.secondary },
  pill: { marginLeft: "auto", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 },
  row: { display: "flex", alignItems: "center", gap: theme.spacing(1), padding: theme.spacing(0.75, 0), borderTop: `1px solid ${theme.palette.divider}` },
  fn: { width: 132, flex: "none", fontSize: 13, fontWeight: 600 },
  people: { flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 4, fontSize: 13, color: theme.palette.text.secondary },
  chip: { padding: "1px 8px", borderRadius: 999, backgroundColor: theme.palette.action.selected, color: theme.palette.text.primary, fontSize: 12 },
  actions: { display: "flex", gap: theme.spacing(1), marginTop: theme.spacing(0.5) },
  section: { marginBottom: theme.spacing(2) },
  empty: { textAlign: "center", padding: theme.spacing(6, 2), color: theme.palette.text.secondary },
  queueRow: { display: "flex", alignItems: "center", gap: theme.spacing(1.5), padding: theme.spacing(0.75, 0) },
  dot: { width: 10, height: 10, borderRadius: "50%", flex: "none" },
}));

const PoloForm = ({ open, polo, onClose, onSaved }) => {
  const [v, setV] = useState({ code: "", name: "", city: "", state: "", active: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setV(polo ? { code: polo.code || "", name: polo.name || "", city: polo.city || "", state: polo.state || "", active: !!polo.active } : { code: "", name: "", city: "", state: "RO", active: true });
  }, [polo, open]);
  const save = async () => {
    setBusy(true);
    try {
      if (polo) await api.put(`/polos/${polo.id}`, v);
      else await api.post("/polos", v);
      toast.success(polo ? "Polo atualizado." : "Polo criado, com as filas de cada função.");
      onSaved();
      onClose();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{polo ? "Editar polo" : "Novo polo"}</DialogTitle>
      <DialogContent>
        <TextField fullWidth variant="outlined" margin="dense" label="Código do polo" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} helperText="Ex.: 2085 (opcional)" />
        <TextField fullWidth autoFocus variant="outlined" margin="dense" required label="Nome do polo" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} helperText="Ex.: Porto Velho - Centro" />
        <div style={{ display: "flex", gap: 8 }}>
          <TextField fullWidth variant="outlined" margin="dense" label="Cidade" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} />
          <TextField select variant="outlined" margin="dense" label="UF" style={{ width: 110 }} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })}>
            {UFS.map((u) => (<MenuItem key={u} value={u}>{u}</MenuItem>))}
          </TextField>
        </div>
        <FormControlLabel
          control={<Switch color="primary" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />}
          label={<span>Polo ativo <b style={{ fontSize: 12, color: v.active ? "#15803d" : "#64748b" }}>{v.active ? "• ligado" : "• desligado"}</b></span>}
        />
        {!polo && <Typography variant="caption" color="textSecondary" display="block">Ao salvar, o sistema cria as filas Comercial, Tutoria, Acadêmico e Coordenação deste polo.</Typography>}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disabled={busy || v.name.trim().length < 2} onClick={save}>{busy ? <CircularProgress size={18} /> : "Salvar"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const TeamDialog = ({ open, polo, users, onClose, onSaved }) => {
  const classes = useStyles();
  const [team, setTeam] = useState({});
  const [queues, setQueues] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!polo) return;
    const t = {};
    FUNCTIONS.forEach((f) => {
      t[f.key] = (polo.members || []).filter((m) => m.role === f.key).map((m) => m.userId);
    });
    setTeam(t);
    setQueues(polo.queues || []);
  }, [polo, open]);

  const save = async () => {
    setBusy(true);
    try {
      const members = [];
      FUNCTIONS.forEach((f) => (team[f.key] || []).forEach((userId) => members.push({ userId, role: f.key })));
      await api.put(`/polos/${polo.id}/members`, { members });
      toast.success("Equipe do polo salva.");
      onSaved();
      onClose();
    } catch (err) {
      toastError(err);
    }
    setBusy(false);
  };

  const setDistribution = async (queue, autoAssign) => {
    try {
      await api.put(`/queue/${queue.id}`, { name: queue.name, color: queue.color, autoAssign });
      setQueues((qs) => qs.map((q) => (q.id === queue.id ? { ...q, autoAssign } : q)));
      toast.success("Distribuição atualizada.");
    } catch (err) {
      toastError(err);
    }
  };

  if (!polo) return null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle>Equipe · {polo.name}</DialogTitle>
      <DialogContent dividers>
        {FUNCTIONS.map((f) => (
          <div key={f.key} className={classes.section}>
            <Autocomplete
              multiple
              options={users}
              getOptionLabel={(u) => u.name}
              getOptionSelected={(a, b) => a.id === b.id}
              value={users.filter((u) => (team[f.key] || []).includes(u.id))}
              onChange={(e, list) => setTeam((t) => ({ ...t, [f.key]: list.map((u) => u.id) }))}
              noOptionsText="Nenhum usuário. Cadastre em Usuários."
              renderInput={(params) => <TextField {...params} variant="outlined" margin="dense" label={f.label} helperText={f.hint} />}
            />
          </div>
        ))}
        <Typography variant="subtitle2" style={{ marginTop: 8 }}>Como a fila reparte os atendimentos</Typography>
        {queues.map((q) => (
          <div key={q.id} className={classes.queueRow}>
            <span className={classes.dot} style={{ backgroundColor: q.color }} />
            <span style={{ flex: 1, fontSize: 14 }}>{q.name}</span>
            <TextField select size="small" variant="outlined" style={{ minWidth: 230 }} value={q.autoAssign || "none"} onChange={(e) => setDistribution(q, e.target.value)}>
              {DISTRIBUTION.map((d) => (<MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>))}
            </TextField>
          </div>
        ))}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="contained" color="primary" disabled={busy} onClick={save}>{busy ? <CircularProgress size={18} /> : "Salvar equipe"}</Button>
      </DialogActions>
    </Dialog>
  );
};

const POLO_COLUMNS = [
  { key: "code", label: "Código", aliases: ["codigo", "cod"], hint: "Código do polo (opcional). Ex.: 2085" },
  { key: "name", label: "Polo", required: true, aliases: ["nome", "nome do polo"], hint: "Nome do polo. Ex.: Porto Velho - Centro" },
  { key: "city", label: "Cidade", hint: "Cidade do polo (opcional)" },
  { key: "state", label: "UF", aliases: ["estado"], hint: "Sigla do estado com 2 letras. Ex.: RO" },
];

const Polos = () => {
  const classes = useStyles();
  const [polos, setPolos] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ open: false, polo: null });
  const [team, setTeam] = useState({ open: false, polo: null });
  const [importOpen, setImportOpen] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, u] = await Promise.all([api.get("/polos"), api.get("/users", { params: { pageNumber: 1 } })]);
      setPolos(p.data);
      setUsers(u.data.users || []);
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    try {
      await api.delete(`/polos/${removing.id}`);
      toast.success("Polo excluído.");
      load();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <ConfirmationModal title={`Excluir o polo ${removing ? removing.name : ""}?`} open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove}>
        As filas do polo também serão excluídas. Polos com leads ou conversas só podem ser desativados.
      </ConfirmationModal>
      <PoloForm open={form.open} polo={form.polo} onClose={() => setForm({ open: false, polo: null })} onSaved={load} />
      <TeamDialog open={team.open} polo={team.polo} users={users} onClose={() => setTeam({ open: false, polo: null })} onSaved={load} />
      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={load}
        title="Importar polos"
        endpoint="/polos/import"
        templateName="modelo-polos"
        columns={POLO_COLUMNS}
        examples={[
          { code: "1001", name: "Polo Exemplo - Centro", city: "Cidade Exemplo", state: "RO" },
          { code: "1002", name: "Polo Exemplo - Norte", city: "Outra Cidade", state: "RO" },
        ]}
        instructions={["Cada polo ganha as filas Comercial, Tutoria, Acadêmico e Coordenação automaticamente.", "Polos com o mesmo código (ou nome) são atualizados, não duplicados.", "A equipe de cada polo é escolhida depois, no botão Equipe."]}
      />
      <MainHeader>
        <Title>Polos e equipes</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => setImportOpen(true)}>Importar planilha</Button>
          <Button variant="contained" color="primary" onClick={() => setForm({ open: true, polo: null })}>Novo polo</Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      {loading ? (
        <div className={classes.empty}><CircularProgress /></div>
      ) : polos.length === 0 ? (
        <div className={classes.empty}>
          <Typography variant="h6">Nenhum polo cadastrado</Typography>
          <Typography variant="body2">Cadastre os polos e defina quem atende em cada função (comercial, tutoria, acadêmico e coordenação). Você pode importar uma planilha.</Typography>
        </div>
      ) : (
        <div className={classes.grid}>
          {polos.map((p) => (
            <div key={p.id} className={classes.card}>
              <div className={classes.head}>
                <div>
                  <div className={classes.name}>{p.name}</div>
                  <div className={classes.meta}>{[p.code && `Cód. ${p.code}`, [p.city, p.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ") || "Sem cidade informada"}</div>
                </div>
                <span className={classes.pill} style={p.active ? { color: "#15803d", backgroundColor: "rgba(22,163,74,.13)" } : { color: "#64748b", backgroundColor: "rgba(100,116,139,.15)" }}>
                  {p.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div>
                {FUNCTIONS.map((f) => {
                  const list = (p.members || []).filter((m) => m.role === f.key);
                  return (
                    <div key={f.key} className={classes.row}>
                      <span className={classes.fn}>{f.label}</span>
                      <span className={classes.people}>
                        {list.length === 0 ? "Ninguém definido" : list.map((m) => (<span key={m.id} className={classes.chip}>{m.user?.name}</span>))}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className={classes.actions}>
                <Button size="small" variant="contained" color="primary" onClick={() => setTeam({ open: true, polo: p })}>Equipe</Button>
                <Button size="small" variant="outlined" onClick={() => setForm({ open: true, polo: p })}>Editar</Button>
                <Button size="small" variant="outlined" color="secondary" style={{ marginLeft: "auto" }} onClick={() => setRemoving(p)}>Excluir</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainContainer>
  );
};

export default Polos;
