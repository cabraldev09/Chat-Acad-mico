import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import CancelOutlined from "@material-ui/icons/CancelOutlined";
import { format, parseISO } from "date-fns";

import CrudPage from "../../components/CrudPage";
import IconAction from "../../components/IconAction";
import StepsEditor, { emptyStep } from "../Campaigns/StepsEditor";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const STATUS = {
  pending: "Agendada",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  uncertain: "Conferir entrega",
  cancelled: "Cancelada",
};

const Schedules = () => {
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    api.get("/whatsapp").then(({ data }) => setConnections(data));
  }, []);

  return (
    <CrudPage
      title="Mensagens agendadas"
      endpoint="/schedules"
      addLabel="Agendar mensagem"
      socketEvent="schedule"
      emptyText="Nenhuma mensagem agendada."
      fields={[
        {
          name: "contactId",
          label: "Contato",
          type: "contact",
          required: true,
        },
        {
          name: "whatsappId",
          label: "Conexão (vazio = padrão)",
          type: "select",
          options: connections.map((w) => ({ value: w.id, label: w.name })),
        },
        { name: "sendAt", label: "Enviar em", type: "datetime", required: true },
        {
          name: "steps",
          type: "custom",
          label: "Mensagens",
          default: [emptyStep()],
          render: (value, setValue) => (
            <StepsEditor schedule steps={Array.isArray(value) && value.length ? value : [emptyStep()]} onChange={setValue} />
          ),
        },
      ]}
      mapIn={(row) => ({
        ...row,
        steps: Array.isArray(row.steps) && row.steps.length
          ? row.steps.map((st) => ({ ...st, mediaName: st.mediaUrl || "" }))
          : [{ ...emptyStep(), body: row.body || "", mediaUrl: row.mediaUrl || null, mediaName: row.mediaUrl || "", type: row.mediaUrl ? "media" : "text" }],
      })}
      mapOut={(payload) => ({ ...payload, steps: (payload.steps || []).map(({ mediaName, ...st }) => st) })}
      columns={[
        { header: "Contato", render: (r) => r.contact?.name },
        { header: "Quando", render: (r) => format(parseISO(r.sendAt), "dd/MM/yyyy HH:mm") },
        { header: "Mensagem", render: (r) => {
          const n = Array.isArray(r.steps) ? r.steps.length : 1;
          const text = (r.body || "").length > 60 ? `${r.body.slice(0, 60)}…` : r.body || "(arquivo)";
          return <span>{text}{n > 1 ? <span style={{ color: "var(--text-2)", fontSize: 12 }}> · {Math.min(r.stepsDone || 0, n)}/{n} enviadas</span> : null}</span>;
        } },
        {
          header: "Situação",
          render: (r) => (
            <span title={r.error || ""}>{STATUS[r.status] || r.status}</span>
          ),
        },
      ]}
      canEdit={(r) => r.status === "pending"}
      rowActions={(r, reload) =>
        r.status === "pending" && (
          <IconAction
            title="Cancelar envio"
            onClick={async () => {
              try {
                await api.post(`/schedules/${r.id}/cancel`);
                toast.success("Agendamento cancelado");
                reload();
              } catch (err) {
                toastError(err);
              }
            }}
          >
            <CancelOutlined />
          </IconAction>
        )
      }
    />
  );
};

export default Schedules;
