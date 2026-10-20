import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  Button,
  IconButton,
  makeStyles,
  Paper,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  CircularProgress,
} from "@material-ui/core";
import { Edit, DeleteOutline } from "@material-ui/icons";
import { Autocomplete } from "@material-ui/lab";
import ColorSwatchPicker from "../ColorSwatchPicker";

import MainContainer from "../MainContainer";
import MainHeader from "../MainHeader";
import MainHeaderButtonsWrapper from "../MainHeaderButtonsWrapper";
import Title from "../Title";
import ResponsiveTable from "../ResponsiveTable";
import ConfirmationModal from "../ConfirmationModal";
import openSocket from "../../services/socket-io";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  empty: { padding: theme.spacing(4), textAlign: "center", opacity: 0.7 },
  field: { marginTop: theme.spacing(1) },
  hint: { opacity: 0.7, marginTop: theme.spacing(0.5) },
}));

const EmbeddedWrapper = ({ children }) => (
  <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>{children}</div>
);

// local datetime <-> <input type="datetime-local">
export const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

const ContactPicker = ({ label, value, onChange, initial, required, helper }) => {
  const [options, setOptions] = useState(initial ? [initial] : []);
  const [input, setInput] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/contacts", { params: { searchParam: input, pageNumber: 1 } });
        setOptions((prev) => {
          const list = data.contacts || [];
          const keep = initial && !list.find((c) => c.id === initial.id) ? [initial] : [];
          return [...keep, ...list];
        });
      } catch (err) {
        // search is best effort
      }
    }, 300);
    return () => clearTimeout(t);
  }, [input, initial]);

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(o) => `${o.name} (${o.number})`}
      getOptionSelected={(o, v) => o.id === v.id}
      value={options.find((o) => o.id === value) || null}
      onChange={(e, v) => onChange(v ? v.id : "")}
      onInputChange={(e, v, reason) => reason === "input" && setInput(v)}
      noOptionsText="Nenhum contato"
      renderInput={(params) => (
        <TextField {...params} label={label} variant="outlined" margin="dense" required={required} helperText={helper} />
      )}
    />
  );
};

const defaultValueFor = (f) => {
  if (f.default !== undefined) return f.default;
  if (f.type === "switch") return false;
  if (f.type === "multiselect") return [];
  return "";
};

/*
 fields: [{ name, label, type: text|textarea|number|select|switch|datetime|password|color|multiselect,
            options: [{value,label}], required, helper, multiline rows, hideOn: (values)=>bool }]
 columns: [{ header, field | render(row) }]
*/
const CrudPage = ({
  title,
  endpoint,
  columns,
  fields,
  addLabel = "Adicionar",
  socketEvent,
  mapIn,
  mapOut,
  rowActions,
  headerExtra,
  canEdit = () => true,
  canDelete = () => true,
  dialogWidth = "sm",
  emptyText = "Nada cadastrado ainda.",
  reloadKey,
  embedded = false,
}) => {
  const classes = useStyles();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(endpoint);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    if (!socketEvent) return undefined;
    const socket = openSocket();
    socket.on(socketEvent, () => load());
    return () => socket.disconnect();
  }, [socketEvent, load]);

  const blank = () =>
    fields.reduce((acc, f) => ({ ...acc, [f.name]: defaultValueFor(f) }), {});

  const openNew = () => {
    setEditing(null);
    setValues(blank());
    setOpen(true);
  };

  const openEdit = (row) => {
    const base = blank();
    const incoming = mapIn ? mapIn(row) : row;
    fields.forEach((f) => {
      if (incoming[f.name] !== undefined && incoming[f.name] !== null) {
        base[f.name] = f.type === "datetime" ? toLocalInput(incoming[f.name]) : incoming[f.name];
      }
    });
    setEditing(row);
    setValues(base);
    setOpen(true);
  };

  const save = async () => {
    for (const f of fields) {
      if (f.required && !(f.hideOn && f.hideOn(values))) {
        const v = values[f.name];
        if (v === "" || v === undefined || v === null) {
          toast.error(`Preencha: ${f.label}`);
          return;
        }
      }
    }
    let payload = { ...values };
    Object.keys(payload).forEach((k) => k.endsWith("__label") && delete payload[k]);
    fields.forEach((f) => {
      if (f.type === "datetime" && payload[f.name]) {
        payload[f.name] = new Date(payload[f.name]).toISOString();
      }
      if (f.type === "number" && payload[f.name] !== "") {
        payload[f.name] = Number(payload[f.name]);
      }
    });
    if (mapOut) payload = mapOut(payload, editing);
    setSaving(true);
    try {
      if (editing) await api.put(`${endpoint}/${editing.id}`, payload);
      else await api.post(endpoint, payload);
      toast.success("Salvo com sucesso");
      setOpen(false);
      load();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`${endpoint}/${deleting.id}`);
      toast.success("Removido");
      load();
    } catch (err) {
      toastError(err);
    }
    setDeleting(null);
  };

  const set = (name, v) => setValues((prev) => ({ ...prev, [name]: v }));

  const renderField = (f) => {
    if (f.hideOn && f.hideOn(values)) return null;
    const common = {
      key: f.name,
      label: f.label,
      fullWidth: true,
      variant: "outlined",
      margin: "dense",
      required: f.required,
      helperText: f.helper,
      autoFocus: f === fields[0],
    };
    // free-form field: f.render(value, setValue, allValues) returns the element
    if (f.type === "custom") {
      return <div key={f.name} className={classes.field}>{f.render(values[f.name], (v) => set(f.name, v), values)}</div>;
    }
    if (f.type === "switch") {
      return (
        <div key={f.name} className={classes.field}>
          <FormControlLabel
            control={
              <Switch
                color="primary"
                checked={!!values[f.name]}
                onChange={(e) => set(f.name, e.target.checked)}
              />
            }
            label={
              <span>
                {f.label}{" "}
                <b style={{ color: values[f.name] ? "#15803d" : "#64748b", fontSize: 12, marginLeft: 4 }}>
                  {values[f.name] ? f.onLabel || "• ligado" : f.offLabel || "• desligado"}
                </b>
              </span>
            }
          />
          {f.helper && <Typography variant="caption" display="block" className={classes.hint}>{f.helper}</Typography>}
        </div>
      );
    }
    if (f.type === "color") {
      return (
        <div key={f.name} className={classes.field}>
          <ColorSwatchPicker
            label={f.label}
            value={values[f.name]}
            onChange={(v) => set(f.name, v)}
            previewText={values[f.previewFrom || "name"]}
          />
        </div>
      );
    }
    if (f.type === "file") {
      return (
        <div key={f.name} className={classes.field}>
          <Button variant="outlined" component="label" size="small">
            {values[f.name] ? "Trocar arquivo" : f.label}
            <input
              type="file"
              hidden
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const form = new FormData();
                form.append("file", file);
                try {
                  const { data } = await api.post("/uploads", form);
                  set(f.name, data.filename);
                  set(`${f.name}__label`, data.originalname);
                } catch (err) {
                  toastError(err);
                }
              }}
            />
          </Button>
          {values[f.name] && (
            <>
              <span style={{ marginLeft: 8, fontSize: 13 }}>
                {values[`${f.name}__label`] || values[f.name]}
              </span>
              <Button size="small" onClick={() => set(f.name, "")}>remover</Button>
            </>
          )}
          {f.helper && <Typography variant="caption" display="block" className={classes.hint}>{f.helper}</Typography>}
        </div>
      );
    }
    if (f.type === "contact") {
      return (
        <ContactPicker
          key={f.name}
          label={f.label}
          required={f.required}
          helper={f.helper}
          value={values[f.name]}
          initial={editing && editing.contact}
          onChange={(v) => set(f.name, v)}
        />
      );
    }
    if (f.type === "combo") {
      // pick from the list or type a new value
      return (
        <Autocomplete
          key={f.name}
          freeSolo
          options={f.options || []}
          value={values[f.name] || ""}
          onChange={(e, v) => set(f.name, v || "")}
          onInputChange={(e, v, reason) => reason === "input" && set(f.name, v)}
          renderInput={(params) => (
            <TextField {...params} label={f.label} variant="outlined" margin="dense" fullWidth helperText={f.helper || "Escolha na lista ou digite uma nova"} required={f.required} />
          )}
        />
      );
    }
    if (f.type === "select" || f.type === "multiselect") {
      const multi = f.type === "multiselect";
      const empty = !(f.options || []).length;
      return (
        <TextField
          {...common}
          select
          InputLabelProps={{ shrink: true }}
          helperText={empty ? f.emptyText || "Nada cadastrado ainda." : f.helper}
          disabled={empty && !!f.disableWhenEmpty}
          SelectProps={{
            multiple: multi,
            displayEmpty: true,
            renderValue: multi
              ? (sel) => (sel.length ? sel.map((id) => ((f.options || []).find((o) => o.value === id) || {}).label || id).join(", ") : <span style={{ opacity: 0.6 }}>Todas</span>)
              : undefined,
          }}
          value={values[f.name] === null || values[f.name] === undefined ? "" : values[f.name]}
          onChange={(e) => set(f.name, e.target.value)}
        >
          {(f.options || []).map((o) => (
            <MenuItem key={String(o.value)} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }
    if (f.type === "datetime") {
      return (
        <TextField
          {...common}
          type="datetime-local"
          InputLabelProps={{ shrink: true }}
          value={values[f.name] || ""}
          onChange={(e) => set(f.name, e.target.value)}
        />
      );
    }
    return (
      <TextField
        {...common}
        type={f.type === "number" ? "number" : f.type === "password" ? "password" : f.type === "color" ? "color" : "text"}
        multiline={f.type === "textarea"}
        rows={f.type === "textarea" ? f.rows || 4 : undefined}
        InputLabelProps={f.type === "color" ? { shrink: true } : undefined}
        value={values[f.name] === null || values[f.name] === undefined ? "" : values[f.name]}
        onChange={(e) => set(f.name, e.target.value)}
        inputProps={f.inputProps}
      />
    );
  };

  const Wrapper = embedded ? EmbeddedWrapper : MainContainer;

  return (
    <Wrapper>
      <ConfirmationModal
        title={deleting ? "Remover este item?" : ""}
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      >
        Essa ação não pode ser desfeita.
      </ConfirmationModal>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth={dialogWidth} fullWidth scroll="paper">
        <DialogTitle>{editing ? "Editar" : addLabel}</DialogTitle>
        <DialogContent>{fields.map(renderField)}</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} color="secondary" variant="outlined" disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} color="primary" variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : "Salvar"}
          </Button>
        </DialogActions>
      </Dialog>

      <MainHeader>
        <Title>{title}</Title>
        <MainHeaderButtonsWrapper>
          {headerExtra}
          <Button variant="contained" color="primary" onClick={openNew}>
            {addLabel}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper className={classes.mainPaper} variant="outlined">
        {!loading && rows.length === 0 ? (
          <Typography className={classes.empty}>{emptyText}</Typography>
        ) : (
          <ResponsiveTable>
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.header} align="center">
                    {c.header}
                  </TableCell>
                ))}
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.header} align="center" data-label={c.header}>
                      {c.render ? c.render(row) : row[c.field]}
                    </TableCell>
                  ))}
                  <TableCell align="center">
                    {rowActions && rowActions(row, load)}
                    {canEdit(row) && (
                      <IconButton aria-label="Editar" size="small" onClick={() => openEdit(row)}>
                        <Edit />
                      </IconButton>
                    )}
                    {canDelete(row) && (
                      <IconButton aria-label="Excluir" size="small" onClick={() => setDeleting(row)}>
                        <DeleteOutline />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        )}
      </Paper>
    </Wrapper>
  );
};

export default CrudPage;
