import { toast } from "react-toastify";
import { i18n } from "../translate/i18n";

// Friendly Portuguese fallbacks when the server gave no (translatable) message.
const byStatus = {
	400: "Os dados enviados não são válidos. Confira e tente de novo.",
	401: "Sua sessão expirou. Entre novamente.",
	403: "Você não tem permissão para fazer isso.",
	404: "Não encontramos o que você pediu.",
	409: "Já existe um registro igual a esse.",
	413: "O arquivo é grande demais.",
	422: "Não foi possível concluir: confira as informações.",
	429: "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.",
	500: "Erro interno no servidor. Tente de novo em instantes.",
	502: "O servidor está indisponível no momento. Tente de novo em instantes.",
	503: "O servidor está indisponível no momento. Tente de novo em instantes.",
};

const toastError = err => {
	const errorMsg = err?.response?.data?.message || err?.response?.data?.error;
	if (errorMsg) {
		if (i18n.exists(`backendErrors.${errorMsg}`)) {
			toast.error(i18n.t(`backendErrors.${errorMsg}`), { toastId: errorMsg });
		} else if (/^ERR_[A-Z0-9_]+$/.test(String(errorMsg))) {
			toast.error(byStatus[err.response.status] || "Não foi possível concluir a ação.", { toastId: errorMsg });
		} else if (/^[\x00-\x7F]*$/.test(String(errorMsg)) && /[a-z]{4,} [a-z]{3,}/i.test(String(errorMsg))) {
			// plain English server text: show the friendly Portuguese one instead
			toast.error(byStatus[err.response?.status] || "Não foi possível concluir a ação.", { toastId: String(errorMsg) });
		} else {
			toast.error(errorMsg, { toastId: errorMsg });
		}
	} else if (err?.response?.status && byStatus[err.response.status]) {
		toast.error(byStatus[err.response.status]);
	} else if (!err?.response) {
		toast.error("Sem conexão com o servidor. Verifique a internet e tente novamente.");
	} else {
		toast.error("Algo deu errado. Tente novamente.");
	}
};

export default toastError;
