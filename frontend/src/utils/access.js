// What a person may do is decided by the server; the screens only decide what to show.
//  admin         everything
//  coordenacao   coordinator: manages the team, the sectors, the connections and the CRM, but never creates or
//                promotes administrators and never reads the credentials (payment gateway, API tokens, webhooks,
//                AI keys, e-mail/SMTP): those are the administrator's alone (isStrictAdmin)
//  everyone else their own area
export const accessLevel = (user) => (user && user.profile === "admin" ? "admin" : user && user.role === "coordenacao" ? "coordenacao" : "user");
export const isManager = (user) => accessLevel(user) !== "user";
// the retention area: the maintainer (administrator) and the academic coordinator
export const canOperateRetention = (user) => accessLevel(user) === "admin" || (!!user && user.role === "coordenacao" && user.coordArea === "academica");
export const isStrictAdmin = (user) => accessLevel(user) === "admin";
// a QR Code number the management gave to this person (they read its QR Code on their own phone)
export const isOwnQrNumber = (user, w) => !!user && !!w && w.ownerId === user.id && (w.channel || "whatsapp") === "whatsapp";
// Conexões: the management, or whoever has a QR Code number of their own to keep connected
export const canSeeConnections = (user, whatsApps) => isManager(user) || (whatsApps || []).some((w) => isOwnQrNumber(user, w));

export const COORD_AREA_LABEL = { comercial: "Coordenação comercial", academica: "Coordenação acadêmica" };
export const roleLabel = (u) =>
  ({ admin: "Administrador", consultor: "Consultor", tutor: "Tutor (acadêmico)", academico: "Tutor (acadêmico)", relacionamento: "Relacionamento" }[u.role]) ||
  (u.role === "coordenacao" ? COORD_AREA_LABEL[u.coordArea] || "Coordenação" : u.profile);
