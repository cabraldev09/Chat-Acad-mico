import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { IconButton } from "@material-ui/core";
import CancelOutlined from "@material-ui/icons/CancelOutlined";
import { format, parseISO } from "date-fns";

import CrudPage from "../../components/CrudPage";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const STATUS = {
  pending: "Agendada",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
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
        { name: "body", label: "Mensagem", type: "textarea", required: true, helper: "Use {{name}} para o nome do contato." },
      ]}
      columns={[
        { header: "Contato", render: (r) => r.contact?.name },
        { header: "Quando", render: (r) => format(parseISO(r.sendAt), "dd/MM/yyyy HH:mm") },
        { header: "Mensagem", render: (r) => (r.body.length > 60 ? `${r.body.slice(0, 60)}…` : r.body) },
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
          <IconButton
            size="small"
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
          </IconButton>
        )
      }
    />
  );
};

export default Schedules;
