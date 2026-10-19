import React, { useState, useEffect, useMemo } from "react";
import { useHistory } from "react-router-dom";

import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import Select from "@material-ui/core/Select";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import { makeStyles } from "@material-ui/core";

import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Autocomplete, {
	createFilterOptions,
} from "@material-ui/lab/Autocomplete";
import CircularProgress from "@material-ui/core/CircularProgress";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import toastError from "../../errors/toastError";
import useQueues from "../../hooks/useQueues";

const useStyles = makeStyles((theme) => ({
  maxWidth: {
    width: "100%",
  },
}));

const filterOptions = createFilterOptions({
	trim: true,
});

// the person who transfers chooses the DEPARTMENT (and the polo when the department has one per polo): the connection (the
// number the conversation goes on) is never asked, it stays the one the client wrote to
const DEPARTMENT = { comercial: "Comercial", tutoria: "Tutoria", coordenacao: "Coordenação", relacionamento: "Relacionamento" };
const keyOf = (q) => (q.role && DEPARTMENT[q.role] ? `role:${q.role}` : `queue:${q.id}`);
const labelOf = (q) => (q.role && DEPARTMENT[q.role] ? DEPARTMENT[q.role] : q.name);
const poloOf = (q) => String(q.name || "").replace(/^[^·]*·\s*/, "") || q.name;

const TransferTicketModal = ({ modalOpen, onClose, ticketid }) => {
	const history = useHistory();
	const [options, setOptions] = useState([]);
	const [queues, setQueues] = useState([]);
	const [allQueues, setAllQueues] = useState([]);
	const [loading, setLoading] = useState(false);
	const [searchParam, setSearchParam] = useState("");
	const [selectedUser, setSelectedUser] = useState(null);
	const [department, setDepartment] = useState('');
	const [selectedQueue, setSelectedQueue] = useState('');
	const [note, setNote] = useState("");
	const [notifyClient, setNotifyClient] = useState(false);
	const classes = useStyles();
	const { findAll: findAllQueues } = useQueues();

	// departments among the queues that can receive the conversation (one entry per department, not per polo)
	const departments = useMemo(() => {
		const seen = new Map();
		queues.forEach((q) => { if (!seen.has(keyOf(q))) seen.set(keyOf(q), labelOf(q)); });
		return [...seen.entries()].map(([key, label]) => ({ key, label }));
	}, [queues]);
	const polos = useMemo(() => queues.filter((q) => keyOf(q) === department), [queues, department]);

	useEffect(() => {
		const loadQueues = async () => {
			const list = await findAllQueues();
			setAllQueues(list);
			setQueues(list);
		}
		loadQueues();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!modalOpen || searchParam.length < 3) {
			setLoading(false);
			return;
		}
		setLoading(true);
		const delayDebounceFn = setTimeout(() => {
			const fetchUsers = async () => {
				try {
					const { data } = await api.get("/users/", {
						params: { searchParam },
					});
					setOptions(data.users);
					setLoading(false);
				} catch (err) {
					setLoading(false);
					toastError(err);
				}
			};

			fetchUsers();
		}, 500);
		return () => clearTimeout(delayDebounceFn);
	}, [searchParam, modalOpen]);

	const handleClose = () => {
		onClose();
		setSearchParam("");
		setSelectedUser(null);
		setSelectedQueue("");
		setDepartment("");
		setNote("");
		setNotifyClient(false);
	};

	const handleSaveTicket = async e => {
		e.preventDefault();
		if (!ticketid) return;
		if (department && !selectedQueue) {
			toast.error(i18n.t("transferTicketModal.choosePolo"));
			return;
		}
		if (!selectedUser && !selectedQueue) {
			toast.error(i18n.t("transferTicketModal.chooseDestination"));
			return;
		}
		setLoading(true);
		try {
			let data = {};

			if (selectedUser) {
				data.userId = selectedUser.id
			}

			if (selectedQueue && selectedQueue !== null) {
				data.queueId = selectedQueue

				if (!selectedUser) {
					data.status = 'pending';
					data.userId = null;
				}
			}

			if (note.trim()) data.note = note.trim();
			if (notifyClient) data.notifyClient = true;

			await api.put(`/tickets/${ticketid}`, data);

			setLoading(false);
			history.push(`/tickets`);
		} catch (err) {
			setLoading(false);
			toastError(err);
		}
	};

	return (
		<Dialog open={modalOpen} onClose={handleClose} maxWidth="xs" fullWidth scroll="paper">
			<form onSubmit={handleSaveTicket}>
				<DialogTitle id="form-dialog-title">
					{i18n.t("transferTicketModal.title")}
				</DialogTitle>
				<DialogContent dividers>
					<Autocomplete
						fullWidth
						style={{ minWidth: 320, marginBottom: 20 }}
						getOptionLabel={option => `${option.name}`}
						onChange={(e, newValue) => {
							setSelectedUser(newValue);
							setDepartment('');
							setSelectedQueue('');
							if (newValue != null && Array.isArray(newValue.queues)) {
								setQueues(newValue.queues);
							} else {
								setQueues(allQueues);
							}
						}}
						options={options}
						filterOptions={filterOptions}
						freeSolo
						autoHighlight
						noOptionsText={i18n.t("transferTicketModal.noOptions")}
						loading={loading}
						renderInput={params => (
							<TextField
								{...params}
								label={i18n.t("transferTicketModal.fieldLabel")}
								variant="outlined"
								autoFocus
								onChange={e => setSearchParam(e.target.value)}
								InputProps={{
									...params.InputProps,
									endAdornment: (
										<React.Fragment>
											{loading ? (
												<CircularProgress color="inherit" size={20} />
											) : null}
											{params.InputProps.endAdornment}
										</React.Fragment>
									),
								}}
							/>
						)}
					/>
					<FormControl variant="outlined" className={classes.maxWidth}>
						<InputLabel>{i18n.t("transferTicketModal.fieldQueueLabel")}</InputLabel>
						<Select
							value={department}
							onChange={(e) => {
								const key = e.target.value;
								setDepartment(key);
								const list = queues.filter((q) => keyOf(q) === key);
								// a department with a single queue is chosen at once; with one per polo the person picks the polo
								setSelectedQueue(list.length === 1 ? list[0].id : '');
							}}
							label={i18n.t("transferTicketModal.fieldQueuePlaceholder")}
						>
							<MenuItem value={''}>&nbsp;</MenuItem>
							{departments.map((d) => (
								<MenuItem key={d.key} value={d.key}>{d.label}</MenuItem>
							))}
						</Select>
					</FormControl>
					{polos.length > 1 && (
						<FormControl variant="outlined" className={classes.maxWidth} style={{ marginTop: 16 }}>
							<InputLabel>{i18n.t("transferTicketModal.fieldPoloLabel")}</InputLabel>
							<Select
								value={selectedQueue}
								onChange={(e) => setSelectedQueue(e.target.value)}
								label={i18n.t("transferTicketModal.fieldPoloLabel")}
							>
								{polos.map((q) => (
									<MenuItem key={q.id} value={q.id}>{poloOf(q)}</MenuItem>
								))}
							</Select>
						</FormControl>
					)}
					<TextField
						className={classes.maxWidth}
						style={{ marginTop: 20 }}
						variant="outlined"
						multiline
						rows={2}
						inputProps={{ maxLength: 500 }}
						label={i18n.t("transferTicketModal.noteLabel")}
						placeholder={i18n.t("transferTicketModal.notePlaceholder")}
						value={note}
						onChange={e => setNote(e.target.value)}
					/>
					<FormControlLabel
						style={{ marginTop: 8 }}
						control={
							<Checkbox
								color="primary"
								checked={notifyClient}
								onChange={e => setNotifyClient(e.target.checked)}
							/>
						}
						label={i18n.t("transferTicketModal.notifyClient")}
					/>
				</DialogContent>
				<DialogActions>
					<Button
						onClick={handleClose}
						color="secondary"
						disabled={loading}
						variant="outlined"
					>
						{i18n.t("transferTicketModal.buttons.cancel")}
					</Button>
					<ButtonWithSpinner
						variant="contained"
						type="submit"
						color="primary"
						loading={loading}
					>
						{i18n.t("transferTicketModal.buttons.ok")}
					</ButtonWithSpinner>
				</DialogActions>
			</form>
		</Dialog>
	);
};

export default TransferTicketModal;
