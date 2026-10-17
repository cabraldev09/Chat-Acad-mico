// What a person may do is decided by the server; the screens only decide what to show.
//  admin         everything
//  coordenacao   coordinator: same powers as the administrator (settings, keys, connections, payments), except
//                creating or promoting administrators
//  everyone else their own area
export const accessLevel = (user) => (user && user.profile === "admin" ? "admin" : user && user.role === "coordenacao" ? "coordenacao" : "user");
export const isManager = (user) => accessLevel(user) !== "user";
export const isStrictAdmin = (user) => accessLevel(user) === "admin";

export const COORD_AREA_LABEL = { comercial: "Coordenação comercial", academica: "Coordenação acadêmica" };
export const roleLabel = (u) =>
  ({ admin: "Administrador", consultor: "Consultor", tutor: "Tutor (acadêmico)", academico: "Tutor (acadêmico)", relacionamento: "Relacionamento" }[u.role]) ||
  (u.role === "coordenacao" ? COORD_AREA_LABEL[u.coordArea] || "Coordenação" : u.profile);
