const rules = {
	user: {
		static: [],
	},

	// coordinators: the whole team and CRM setup, but not the administrator's own areas (deleting, payments, API)
	coordenacao: {
		static: [
			"drawer-admin-items:view",
			"tickets-manager:showall",
			"user-modal:editProfile",
			"user-modal:editQueues",
			// the coordination has the same powers as the administration
			"ticket-options:deleteTicket",
			"ticket-options:transferWhatsapp",
			"contacts-page:deleteContact",
		],
	},

	admin: {
		static: [
			"drawer-admin-items:view",
			"tickets-manager:showall",
			"user-modal:editProfile",
			"user-modal:editQueues",
			"ticket-options:deleteTicket",
			"ticket-options:transferWhatsapp",
			"contacts-page:deleteContact",
		],
	},
};

export default rules;
