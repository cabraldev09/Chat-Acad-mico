import React, { useState, useEffect, useReducer, useContext } from "react";
import { accessLevel } from "../../utils/access";
import openSocket from "../../services/socket-io";
import { toast } from "react-toastify";
import Tooltip from "@material-ui/core/Tooltip";
import { Download } from "lucide-react";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import SearchIcon from "@material-ui/icons/Search";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";

import IconButton from "@material-ui/core/IconButton";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";

import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import ResponsiveTable from "../../components/ResponsiveTable";
import ContactModal from "../../components/ContactModal";
import ConfirmationModal from "../../components/ConfirmationModal/";

import { i18n } from "../../translate/i18n";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import MainContainer from "../../components/MainContainer";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../../components/Can";
import { downloadFile } from "../../utils/saveBlob";
import RelationMenu from "../../components/RelationMenu";

const reducer = (state, action) => {
  if (action.type === "LOAD_CONTACTS") {
    const contacts = action.payload;
    const newContacts = [];

    contacts.forEach((contact) => {
      const contactIndex = state.findIndex((c) => c.id === contact.id);
      if (contactIndex !== -1) {
        state[contactIndex] = contact;
      } else {
        newContacts.push(contact);
      }
    });

    return [...state, ...newContacts];
  }

  if (action.type === "UPDATE_CONTACTS") {
    const contact = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contact.id);

    if (contactIndex !== -1) {
      state[contactIndex] = contact;
      return [...state];
    } else {
      return [contact, ...state];
    }
  }

  if (action.type === "DELETE_CONTACT") {
    const contactId = action.payload;

    const contactIndex = state.findIndex((c) => c.id === contactId);
    if (contactIndex !== -1) {
      state.splice(contactIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
}));

const Contacts = () => {
  const classes = useStyles();
  const history = useHistory();

  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [exporting, setExporting] = useState(false);
  const [contacts, dispatch] = useReducer(reducer, []);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [total, setTotal] = useState(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get("/contacts/", {
            params: { searchParam, pageNumber },
          });
          dispatch({ type: "LOAD_CONTACTS", payload: data.contacts });
          setHasMore(data.hasMore);
          setTotal(data.count);
          setLoading(false);
        } catch (err) {
          toastError(err);
          setLoading(false);
        }
      };
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber, reloadKey]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("contact", (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_CONTACTS", payload: data.contact });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_CONTACT", payload: +data.contactId });
      }
    });

    // the import runs on the server in the background; its result arrives here
    socket.on("contactsImport", (d) => {
      if (d.userId !== user.id) return;
      setImporting(false);
      if (!d.ok) {
        const text = i18n.t(`backendErrors.${d.message}`);
        toast.error(text && !text.startsWith("backendErrors.") ? text : "Não foi possível importar os contatos.");
        return;
      }
      const parts = [];
      parts.push(
        d.created || d.updated
          ? `${d.created} contatos novos${d.updated ? ` e ${d.updated} completados` : ""}`
          : "nenhum contato novo"
      );
      parts.push(`${d.withPhone} de ${d.total} contatos do WhatsApp têm telefone utilizável`);
      parts.push(`${d.groupsFound} grupos encontrados, ${d.groupsCreated} novos`);
      if (d.groupsMode === "off" && d.groupsFound) parts.push("as mensagens dos grupos só viram conversa depois que você escolhe os grupos em Conexões");
      toast.success(`Importação de “${d.connection}” concluída: ${parts.join("; ")}.`, { autoClose: 15000 });
      dispatch({ type: "RESET" });
      setPageNumber(1);
      setReloadKey((k) => k + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [user.id]);

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  // the whole list (or what the search found) as a spreadsheet; management and consultants only
  const canExport = ["admin", "coordenacao", "consultor"].includes(user.profile === "admin" ? "admin" : user.role || "consultor");
  const exportContacts = async () => {
    setExporting(true);
    const ok = await downloadFile("/contacts/export.csv", { searchParam: searchParam || undefined }, "contatos.csv");
    setExporting(false);
    if (ok) toast.success(searchParam ? "Planilha dos contatos encontrados baixada." : "Planilha de todos os contatos baixada.");
  };

  const handleOpenContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };

  const handleSaveTicket = async (contactId) => {
    if (!contactId) return;
    setLoading(true);
    try {
      const { data: ticket } = await api.post("/tickets", {
        contactId: contactId,
        userId: user?.id,
        status: "open",
      });
      history.push(`/tickets/${ticket.id}`);
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const hadleEditContact = (contactId) => {
    setSelectedContactId(contactId);
    setContactModalOpen(true);
  };

  const handleDeleteContact = async (contactId) => {
    try {
      await api.delete(`/contacts/${contactId}`);
      toast.success(i18n.t("contacts.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingContact(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleimportContact = async () => {
    setImporting(true);
    try {
      const { data } = await api.post("/contacts/import");
      toast.info(`Importando os contatos do número “${data.connection}”. Aviso quando terminar, pode continuar usando o sistema.`);
    } catch (err) {
      setImporting(false);
      toastError(err);
    }
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  return (
    <MainContainer className={classes.mainContainer}>
      <ContactModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        aria-labelledby="form-dialog-title"
        contactId={selectedContactId}
      ></ContactModal>
      <ConfirmationModal
        title={
          deletingContact
            ? `${i18n.t("contacts.confirmationModal.deleteTitle")} ${
                deletingContact.name
              }?`
            : `${i18n.t("contacts.confirmationModal.importTitlte")}`
        }
        open={confirmOpen}
        onClose={setConfirmOpen}
        onConfirm={(e) =>
          deletingContact
            ? handleDeleteContact(deletingContact.id)
            : handleimportContact()
        }
      >
        {deletingContact
          ? `${i18n.t("contacts.confirmationModal.deleteMessage")}`
          : `${i18n.t("contacts.confirmationModal.importMessage")}`}
      </ConfirmationModal>
      <MainHeader>
        <Title>{i18n.t("contacts.title")}{total !== null ? ` (${Number(total).toLocaleString("pt-BR")})` : ""}</Title>
        <MainHeaderButtonsWrapper>
          <TextField
            placeholder={i18n.t("contacts.searchPlaceholder")}
            type="search"
            value={searchParam}
            onChange={handleSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon style={{ color: "gray" }} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={(e) => setConfirmOpen(true)}
            disabled={importing}
          >
            {importing ? "Importando…" : i18n.t("contacts.buttons.import")}
          </Button>
          {canExport && (
            <Tooltip title={searchParam ? "Baixa só os contatos da busca atual" : "Baixa todos os contatos em uma planilha"}>
              <span>
                <Button variant="outlined" color="primary" startIcon={<Download size={16} />} onClick={exportContacts} disabled={exporting}>
                  {exporting ? "Preparando..." : "Baixar lista de contatos"}
                </Button>
              </span>
            </Tooltip>
          )}
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenContactModal}
          >
            {i18n.t("contacts.buttons.add")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        <ResponsiveTable>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>{i18n.t("contacts.table.name")}</TableCell>
              <TableCell align="center">
                {i18n.t("contacts.table.whatsapp")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("contacts.table.email")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("contacts.table.actions")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell style={{ paddingRight: 0 }}>
                    {<Avatar src={contact.profilePicUrl} />}
                  </TableCell>
                  <TableCell>
                    {contact.name}
                    {contact.isStaff && <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "rgba(22,163,74,.16)", color: "#15803d", fontWeight: 700 }} title="Da equipe: não conta nas estatísticas nem no funil">Equipe</span>}
                    {contact.isPersonal && <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "rgba(190,24,93,.12)", color: "#be185d", fontWeight: 700 }} title="Amigo ou família: não conta nas estatísticas nem no funil">Amigo</span>}
                    {contact.isGroup && <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "rgba(6,147,227,.14)", color: "#0b4279", fontWeight: 700 }}>Grupo</span>}
                  </TableCell>
                  <TableCell
                    align="center"
                    data-label={i18n.t("contacts.table.whatsapp")}
                  >
                    {contact.number || <span style={{ opacity: 0.6 }} title="O WhatsApp esconde o telefone de algumas pessoas até elas escreverem para você">telefone oculto</span>}
                  </TableCell>
                  <TableCell
                    align="center"
                    data-label={i18n.t("contacts.table.email")}
                  >
                    {contact.email}
                  </TableCell>
                  <TableCell align="center">
                    {!contact.isGroup && <RelationMenu contact={contact} />}
                    <IconButton
                      size="small"
                      onClick={() => handleSaveTicket(contact.id)}
                    >
                      <WhatsAppIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => hadleEditContact(contact.id)}
                    >
                      <EditIcon />
                    </IconButton>
                    <Can
                      role={accessLevel(user)}
                      perform="contacts-page:deleteContact"
                      yes={() => (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setConfirmOpen(true);
                            setDeletingContact(contact);
                          }}
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      )}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {loading && <TableRowSkeleton avatar columns={3} />}
            </>
          </TableBody>
        </ResponsiveTable>
      </Paper>
    </MainContainer>
  );
};

export default Contacts;
