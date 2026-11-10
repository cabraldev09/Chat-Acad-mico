// Where the AI agent (and every other robot) never talks: groups and communities, the channels (feeds), the team's own chats and the personal
// contacts (friends, family). Only a lead's private conversation is attended. Pure, so every entry point asks the same question.
export interface ScopeTicket {
  isGroup?: boolean | null;
  contact?: { isStaff?: boolean | null; isPersonal?: boolean | null; kind?: string | null; parentGroupId?: string | number | null } | null;
}

export const robotMayTalk = (ticket: ScopeTicket): boolean => {
  if (ticket.isGroup) return false;
  const c = ticket.contact;
  if (!c) return true;
  if (c.isStaff || c.isPersonal) return false;
  if (c.kind === "group" || c.kind === "community" || c.kind === "channel" || c.parentGroupId) return false;
  return true;
};
