import React from "react";
import CrudPage from "../../components/CrudPage";

const Tags = () => (
  <CrudPage
    title="Etiquetas"
    endpoint="/tags"
    addLabel="Nova etiqueta"
    socketEvent="tag"
    fields={[
      { name: "name", label: "Nome", required: true },
      { name: "color", label: "Cor", type: "color", default: "#0693E3", required: true },
    ]}
    columns={[
      {
        header: "Etiqueta",
        render: (r) => (
          <span
            style={{
              background: r.color,
              color: "#fff",
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 13,
            }}
          >
            {r.name}
          </span>
        ),
      },
    ]}
  />
);

export default Tags;
