import React, { useEffect, useState, useContext } from 'react';
import { useHistory } from "react-router-dom";
import toastError from "../../errors/toastError";
import api from "../../services/api";

import Avatar from "@material-ui/core/Avatar";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";

import { AuthContext } from "../../context/Auth/AuthContext";

import { Button, Divider, } from "@material-ui/core";

const VcardPreview = ({ contact, numbers }) => {
    const history = useHistory();
    const { user } = useContext(AuthContext);

    const [selectedContact, setContact] = useState({
        name: "",
        number: 0,
        profilePicUrl: ""
    });

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            const fetchContacts = async () => {
                // a card without a number or a name cannot become a contact: nothing to ask the server, nothing to show
                const digits = typeof numbers === "string" ? numbers.replace(/\D/g, "") : "";
                if (!digits || !String(contact || "").trim()) return;
                try {
                    const { data } = await api.post("/contact", { name: contact, number: digits, email: "" });
                    setContact(data);
                } catch (err) {
                    // opening a conversation must not fill the screen with errors because of a shared card
                    // eslint-disable-next-line no-console
                    console.warn("Contact card not saved:", err && err.message);
                }
            };
            fetchContacts();
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }, [contact, numbers]);

    const handleNewChat = async () => {
        try {
            const { data: ticket } = await api.post("/tickets", {
                contactId: selectedContact.id,
                userId: user.id,
                status: "open",
            });
            history.push(`/tickets/${ticket.id}`);
        } catch (err) {
            toastError(err);
        }
    }

    return (
        <>
            <div style={{
                minWidth: "min(250px, 100%)",
            }}>
                <Grid container spacing={1}>
                    <Grid item xs={2}>
                        <Avatar src={selectedContact.profilePicUrl} />
                    </Grid>
                    <Grid item xs={9}>
                        <Typography style={{ marginTop: "12px", marginLeft: "10px" }} variant="subtitle1" color="primary" gutterBottom>
                            {selectedContact.name}
                        </Typography>
                    </Grid>
                    <Grid item xs={12}>
                        <Divider />
                        <Button
                            fullWidth
                            color="primary"
                            onClick={handleNewChat}
                            disabled={!selectedContact.number}
                        >Conversar</Button>
                    </Grid>
                </Grid>
            </div>
        </>
    );

};

export default VcardPreview;