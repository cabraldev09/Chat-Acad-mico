import React from "react";
import { BrowserRouter, Switch } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import LoggedInLayout from "../layout";
import Dashboard from "../pages/Dashboard/";
import Tickets from "../pages/Tickets/";
import Signup from "../pages/Signup/";
import Login from "../pages/Login/";
import Connections from "../pages/Connections/";
import Settings from "../pages/Settings/";
import Users from "../pages/Users";
import Contacts from "../pages/Contacts/";
import QuickAnswers from "../pages/QuickAnswers/";
import Queues from "../pages/Queues/";
import Tags from "../pages/Tags/";
import Schedules from "../pages/Schedules/";
import Campaigns from "../pages/Campaigns/";
import Chatbot from "../pages/Chatbot/";
import AiAgents from "../pages/AiAgents/";
import Webhooks from "../pages/Webhooks/";
import Reports from "../pages/Reports/";
import LiveMonitor from "../pages/LiveMonitor/";
import CrmBoard from "../pages/CRM/Board";
import CrmPanel from "../pages/CRM/Panel";
import CrmTasks from "../pages/CRM/Tasks";
import CrmSettings from "../pages/CRM/Settings";
import { AuthProvider } from "../context/Auth/AuthContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import { ThemeProvider } from "../context/DarkMode";
import Route from "./Route";

const Routes = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Switch>
            <Route exact path="/login" component={Login} />
            <Route exact path="/signup" component={Signup} />
            <WhatsAppsProvider>
              <LoggedInLayout>
                <Route exact path="/" component={Dashboard} isPrivate />
                <Route exact path="/tickets/:ticketId?" component={Tickets} isPrivate />
                <Route exact path="/connections" component={Connections} isPrivate />
                <Route exact path="/contacts" component={Contacts} isPrivate />
                <Route exact path="/users" component={Users} isPrivate />
                <Route exact path="/quickAnswers" component={QuickAnswers} isPrivate />
                <Route exact path="/Settings" component={Settings} isPrivate />
                <Route exact path="/Queues" component={Queues} isPrivate />
                <Route exact path="/tags" component={Tags} isPrivate />
                <Route exact path="/schedules" component={Schedules} isPrivate />
                <Route exact path="/campaigns" component={Campaigns} isPrivate />
                <Route exact path="/chatbot" component={Chatbot} isPrivate />
                <Route exact path="/ai-agents" component={AiAgents} isPrivate />
                <Route exact path="/integrations" component={Webhooks} isPrivate />
                <Route exact path="/reports" component={Reports} isPrivate />
                <Route exact path="/monitor" component={LiveMonitor} isPrivate />
                <Route exact path="/crm" component={CrmBoard} isPrivate />
                <Route exact path="/crm/painel" component={CrmPanel} isPrivate />
                <Route exact path="/crm/tarefas" component={CrmTasks} isPrivate />
                <Route exact path="/crm/config" component={CrmSettings} isPrivate />
              </LoggedInLayout>
            </WhatsAppsProvider>
          </Switch>
          <ToastContainer autoClose={3000} />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
