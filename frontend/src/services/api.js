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
	if (status === 401 && original && !authRequest && !original._retry) {
		original._retry = true;
		const token = await renewToken(true);
		if (token) { original.headers.Authorization = `Bearer ${token}`; return api(original); }
	}
	// the login cannot be renewed: the app signs the person out
	if (status === 401 && !/\/auth\/login/.test((original && original.url) || "")) window.dispatchEvent(new Event("sessionExpired"));
	return Promise.reject(error);
});

export default api;
