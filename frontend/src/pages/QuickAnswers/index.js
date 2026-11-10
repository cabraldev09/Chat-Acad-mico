import React, { useState, useEffect, useReducer } from "react";
import openSocket from "../../services/socket-io";

import { Button, IconButton, makeStyles, Tooltip, InputAdornment, TextField } from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import { Copy, Pencil, Trash2 } from "lucide-react";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import QuickAnswersModal from "../../components/QuickAnswersModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import { toast } from "react-toastify";
import toastError from "../../errors/toastError";

const reducer = (state, action) => {
  if (action.type === "LOAD_QUICK_ANSWERS") {
    const quickAnswers = action.payload;
    const newQuickAnswers = [];

    quickAnswers.forEach((quickAnswer) => {
      const quickAnswerIndex = state.findIndex((q) => q.id === quickAnswer.id);
      if (quickAnswerIndex !== -1) {
        state[quickAnswerIndex] = quickAnswer;
      } else {
        newQuickAnswers.push(quickAnswer);
      }
    });

    return [...state, ...newQuickAnswers];
  }

  if (action.type === "UPDATE_QUICK_ANSWERS") {
    const quickAnswer = action.payload;
    const quickAnswerIndex = state.findIndex((q) => q.id === quickAnswer.id);

    if (quickAnswerIndex !== -1) {
      state[quickAnswerIndex] = quickAnswer;
      return [...state];
    } else {
      return [quickAnswer, ...state];
    }
  }

  if (action.type === "DELETE_QUICK_ANSWERS") {
    const quickAnswerId = action.payload;

    const quickAnswerIndex = state.findIndex((q) => q.id === quickAnswerId);
    if (quickAnswerIndex !== -1) {
      state.splice(quickAnswerIndex, 1);
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
    padding: theme.spacing(0.5, 0.5, 2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  intro: { color: theme.palette.text.secondary, fontSize: 14, margin: theme.spacing(0, 0.5, 2), maxWidth: 760 },
  grid: { display: "grid", gap: theme.spacing(2), gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" },
  card: { display: "flex", flexDirection: "column", gap: theme.spacing(1), padding: theme.spacing(2), borderRadius: 14, border: theme.border.divider, background: theme.palette.cards.background, minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 4 },
  shortcut: { flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: theme.palette.primary.main, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // the text keeps the line breaks and bullets exactly as they will be sent
  text: { margin: 0, fontFamily: "inherit", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 9, WebkitBoxOrient: "vertical", overflow: "hidden" },
  empty: { textAlign: "center", color: theme.palette.text.secondary, padding: theme.spacing(6, 2) },
}));

const QuickAnswers = () => {
  const classes = useStyles();

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [quickAnswers, dispatch] = useReducer(reducer, []);
  const [selectedQuickAnswers, setSelectedQuickAnswers] = useState(null);
  const [quickAnswersModalOpen, setQuickAnswersModalOpen] = useState(false);
  const [deletingQuickAnswers, setDeletingQuickAnswers] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchQuickAnswers = async () => {
        try {
          const { data } = await api.get("/quickAnswers/", {
            params: { searchParam, pageNumber },
          });
          dispatch({ type: "LOAD_QUICK_ANSWERS", payload: data.quickAnswers });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
          setLoading(false);
        }
      };
      fetchQuickAnswers();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("quickAnswer", (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_QUICK_ANSWERS", payload: data.quickAnswer });
      }

      if (data.action === "delete") {
        dispatch({
          type: "DELETE_QUICK_ANSWERS",
          payload: +data.quickAnswerId,
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  };

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleOpenQuickAnswersModal = () => {
    setSelectedQuickAnswers(null);
    setQuickAnswersModalOpen(true);
  };

  const handleCloseQuickAnswersModal = () => {
    setSelectedQuickAnswers(null);
    setQuickAnswersModalOpen(false);
  };

  const handleEditQuickAnswers = (quickAnswer) => {
    setSelectedQuickAnswers(quickAnswer);
    setQuickAnswersModalOpen(true);
  };

  const handleDeleteQuickAnswers = async (quickAnswerId) => {
    try {
      await api.delete(`/quickAnswers/${quickAnswerId}`);
      toast.success(i18n.t("quickAnswers.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingQuickAnswers(null);
    setSearchParam("");
    setPageNumber(1);
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
    <MainContainer>
      <ConfirmationModal
        title={
          deletingQuickAnswers &&
          `${i18n.t("quickAnswers.confirmationModal.deleteTitle")} ${
            deletingQuickAnswers.shortcut
          }?`
        }
        open={confirmModalOpen}
        onClose={setConfirmModalOpen}
        onConfirm={() => handleDeleteQuickAnswers(deletingQuickAnswers.id)}
      >
        {i18n.t("quickAnswers.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      <QuickAnswersModal
        open={quickAnswersModalOpen}
        onClose={handleCloseQuickAnswersModal}
        aria-labelledby="form-dialog-title"
        quickAnswerId={selectedQuickAnswers && selectedQuickAnswers.id}
      ></QuickAnswersModal>
      <MainHeader>
        <Title>{i18n.t("quickAnswers.title")}</Title>
        <MainHeaderButtonsWrapper>
          <TextField
            placeholder={i18n.t("quickAnswers.searchPlaceholder")}
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
            onClick={handleOpenQuickAnswersModal}
          >
            {i18n.t("quickAnswers.buttons.add")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <div className={classes.mainPaper} onScroll={handleScroll}>
        <p className={classes.intro}>
          Textos prontos para a rotina de atendimento. Na conversa, digite <b>/</b> e o atalho (por exemplo, <b>/ficha</b>) e a resposta entra no campo de mensagem com as variáveis preenchidas, pronta para editar antes de enviar.
        </p>
        <div className={classes.grid}>
          {quickAnswers.map((quickAnswer) => (
            <div key={quickAnswer.id} className={classes.card}>
              <div className={classes.head}>
                <span className={classes.shortcut}>/{quickAnswer.shortcut}</span>
                <Tooltip title="Copiar texto">
                  <IconButton size="small" aria-label="Copiar texto" onClick={() => copyText(quickAnswer.message)}>
                    <Copy size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Editar">
                  <IconButton size="small" aria-label="Editar" onClick={() => handleEditQuickAnswers(quickAnswer)}>
                    <Pencil size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Excluir">
                  <IconButton
                    size="small"
                    aria-label="Excluir"
                    onClick={() => {
                      setConfirmModalOpen(true);
                      setDeletingQuickAnswers(quickAnswer);
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              </div>
              <pre className={classes.text}>{quickAnswer.message}</pre>
            </div>
          ))}
        </div>
        {!loading && quickAnswers.length === 0 && (
          <div className={classes.empty}>
            {searchParam ? "Nenhuma resposta encontrada para essa busca." : "Nenhuma resposta rápida ainda. Use o botão acima para criar a primeira."}
          </div>
        )}
        {loading && <div className={classes.empty}>Carregando...</div>}
      </div>
    </MainContainer>
  );
};

export default QuickAnswers;
