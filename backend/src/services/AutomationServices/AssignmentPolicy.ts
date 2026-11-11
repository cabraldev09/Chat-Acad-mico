export const eligibleForAssignment = (user: { acceptsNewTickets?: boolean; maxOpenTickets?: number }, open: number): boolean =>
  user.acceptsNewTickets !== false && (!(Number(user.maxOpenTickets) > 0) || open < Number(user.maxOpenTickets));
