import axios from "axios";
import { getBackendUrl } from "../config";
import { renewToken } from "./session";

const api = axios.create({
	baseURL: getBackendUrl(),
	withCredentials: true,
});

// Installed here, not inside a React effect: a screen asks for its data as soon as it opens, before the parents'
// effects run, and that first request must already carry the login and be renewed when the token has expired.
api.interceptors.request.use(config => {
	try {
		const token = JSON.parse(localStorage.getItem("token") || "null");
		if (token) config.headers.Authorization = `Bearer ${token}`;
	} catch (_) { localStorage.removeItem("token"); }
	return config;
});

api.interceptors.response.use(value => value, async error => {
	const original = error.config;
	const authRequest = /\/auth\/(login|refresh_token|logout|signup)/.test((original && original.url) || "");
	const status = error.response && error.response.status;
	// a request that left without a login (nobody signed in, e.g. the login page) is refused by design: nothing to renew, nobody to sign out
	const hadLogin = !!(original && original.headers && original.headers.Authorization);
	let transient = false;
	if (status === 401 && original && !authRequest && !original._retry && hadLogin) {
		original._retry = true;
		try {
			const token = await renewToken(true);
			if (token) { original.headers.Authorization = `Bearer ${token}`; return api(original); }
		} catch (_) {
			// the renewal failed for a reason of the moment (network, server restarting): the login is still good, so the person stays signed in
			transient = true;
		}
	}
	// the login cannot be renewed (the server says so): the app signs the person out
	if (status === 401 && hadLogin && !transient && !/\/auth\/login/.test((original && original.url) || "")) window.dispatchEvent(new Event("sessionExpired"));
	return Promise.reject(error);
});

export default api;
