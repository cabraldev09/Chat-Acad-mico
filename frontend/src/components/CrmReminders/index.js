import { useContext, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import openSocket from "../../services/socket-io";
import { AuthContext } from "../../context/Auth/AuthContext";

// Toast when one of my follow-up tasks becomes due
const CrmReminders = () => {
  const { user } = useContext(AuthContext);
  const history = useHistory();
  useEffect(() => {
    if (!user || !user.id) return undefined;
    const socket = openSocket();
    socket.on("crmReminder", (t) => {
      if (t.userId && t.userId !== user.id) return;
      toast.info(`⏰ ${t.title}${t.leadName ? ` — ${t.leadName}` : ""}`, {
        autoClose: 12000,
        onClick: () => history.push(`/crm?lead=${t.leadId}`),
      });
    });
    return () => socket.disconnect();
  }, [user, history]);
  return null;
};

export default CrmReminders;
