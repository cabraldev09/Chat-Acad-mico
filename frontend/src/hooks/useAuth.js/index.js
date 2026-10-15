import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket, { renewToken } from "../../services/socket-io";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useAuth = () => {
	const history = useHistory();
	const [isAuth, setIsAuth] = useState(false);
	const [loading, setLoading] = useState(true);
	const [user, setUser] = useState({});

	// The interceptors are registered once (they used to be registered again on every render, so the number of
	// handlers kept growing and a single expired token triggered a storm of "refresh" calls).
	useEffect(() => {
		const requestId = api.interceptors.request.use(
			config => {
				const token = localStorage.getItem("token");
				if (token) {
					try { config.headers["Authorization"] = `Bearer ${JSON.parse(token)}`; } catch (e) { /* a broken value is ignored */ }
				}
				return config;
			},
			error => Promise.reject(error)
		);

		const responseId = api.interceptors.response.use(
			response => response,
			async error => {
				const originalRequest = error.config || {};
				const status = error?.response?.status;
				const isRefresh = String(originalRequest.url || "").includes("/auth/refresh_token");
				// an expired access token: one shared renewal (not one per failed request), then the request is repeated once
				if (status === 403 && !originalRequest._retry && !isRefresh) {
					originalRequest._retry = true;
					const token = await renewToken(true);
					if (token) {
						originalRequest.headers = { ...(originalRequest.headers || {}), Authorization: `Bearer ${token}` };
						return api(originalRequest);
					}
				}
				if (status === 401) {
					localStorage.removeItem("token");
					api.defaults.headers.Authorization = undefined;
					setIsAuth(false);
				}
				return Promise.reject(error);
			}
		);
		return () => {
			api.interceptors.request.eject(requestId);
			api.interceptors.response.eject(responseId);
		};
	}, []);

	useEffect(() => {
		const token = localStorage.getItem("token");
		(async () => {
			if (token) {
				try {
					const { data } = await api.post("/auth/refresh_token");
					api.defaults.headers.Authorization = `Bearer ${data.token}`;
					setIsAuth(true);
					setUser(data.user);
				} catch (err) {
					toastError(err);
				}
			}
			setLoading(false);
		})();
	}, []);

	useEffect(() => {
		const socket = openSocket();

		socket.on("user", data => {
			if (data.action === "update" && data.user.id === user.id) {
				setUser(data.user);
			}
		});

		return () => {
			socket.disconnect();
		};
	}, [user]);

	const handleLogin = async userData => {
		setLoading(true);

		try {
			const { data } = await api.post("/auth/login", userData);
			localStorage.setItem("token", JSON.stringify(data.token));
			api.defaults.headers.Authorization = `Bearer ${data.token}`;
			setUser(data.user);
			setIsAuth(true);
			toast.success(i18n.t("auth.toasts.success"));
			history.push("/tickets");
			setLoading(false);
		} catch (err) {
			toastError(err);
			setLoading(false);
		}
	};

	const handleLogout = async () => {
		setLoading(true);

		try {
			await api.delete("/auth/logout");
			setIsAuth(false);
			setUser({});
			localStorage.removeItem("token");
			api.defaults.headers.Authorization = undefined;
			setLoading(false);
			history.push("/login");
		} catch (err) {
			toastError(err);
			setLoading(false);
		}
	};

	return { isAuth, user, loading, handleLogin, handleLogout };
};

export default useAuth;
