import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Redirect, Switch, useLocation } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import LoggedInLayout from "../layout";
import Signup from "../pages/Signup/";
import Login from "../pages/Login/";
import ForgotPassword from "../pages/ForgotPassword/";
import ResetPassword from "../pages/ResetPassword/";
import { AuthProvider } from "../context/Auth/AuthContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import { ThemeProvider } from "../context/DarkMode";
import BackdropLoading from "../components/BackdropLoading";
import PageErrorBoundary from "../components/PageErrorBoundary";
import { lazyPage as lazy } from "../utils/lazyPage";
import Route from "./Route";

// every page is its own file: the first screen downloads only what it shows
const Tickets = lazy(() => import("../pages/Tickets/"));
const Connections = lazy(() => import("../pages/Connections/"));
const Polos = lazy(() => import("../pages/Polos"));
const Onboarding = lazy(() => import("../pages/Onboarding"));
const Users = lazy(() => import("../pages/Users"));
const Contacts = lazy(() => import("../pages/Contacts/"));
const QuickAnswers = lazy(() => import("../pages/QuickAnswers/"));
const Queues = lazy(() => import("../pages/Queues/"));
const Tags = lazy(() => import("../pages/Tags/"));
const Schedules = lazy(() => import("../pages/Schedules/"));
const Campaigns = lazy(() => import("../pages/Campaigns/"));
const Chatbot = lazy(() => import("../pages/Chatbot/"));
const FlowBuilder = lazy(() => import("../pages/Chatbot/FlowBuilder"));
const LegacyChatbot = lazy(() => import("../pages/Chatbot/Legacy"));
const AiAgents = lazy(() => import("../pages/AiAgents/"));
const Webhooks = lazy(() => import("../pages/Webhooks/"));
const Reports = lazy(() => import("../pages/Reports/"));
const LiveMonitor = lazy(() => import("../pages/LiveMonitor/"));
const CrmBoard = lazy(() => import("../pages/CRM/Board"));
const CrmPanel = lazy(() => import("../pages/CRM/Panel"));
const CrmTasks = lazy(() => import("../pages/CRM/Tasks"));
const CrmCommissions = lazy(() => import("../pages/CRM/Commissions"));
const Goals = lazy(() => import("../pages/Goals"));
const PoloGoals = lazy(() => import("../pages/PoloGoals"));
const SettingsHub = lazy(() => import("../pages/SettingsHub"));
const CrmSettings = lazy(() => import("../pages/CRM/Settings"));
const Affiliates = lazy(() => import("../pages/Affiliates"));
const AffiliatePortal = lazy(() => import("../pages/AffiliatePortal"));
// Switch only looks at direct <Route> children, so the Suspense lives inside the page component
const AffiliatePortalPage = (props) => (
  <PageErrorBoundary>
    <Suspense fallback={<BackdropLoading />}>
      <AffiliatePortal {...props} />
    </Suspense>
  </PageErrorBoundary>
);

// every address gets its own boundary state: an error on one screen never shows on the next
const Guarded = ({ children }) => {
  const { pathname } = useLocation();
  return <PageErrorBoundary resetKey={pathname}>{children}</PageErrorBoundary>;
};

// the two pages everyone opens next are fetched in the background right after the first paint
const warmUp = () => {
  const go = () => { import("../pages/Tickets/"); import("../pages/Reports/"); };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2000);
};

const Routes = () => {
  useEffect(() => { warmUp(); }, []);
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Switch>
            <Route exact path="/login" component={Login} />
            <Route exact path="/signup" component={Signup} />
            <Route exact path="/esqueci-a-senha" component={ForgotPassword} publicPage />
            <Route exact path="/redefinir-senha/:token" component={ResetPassword} publicPage />
            <Route exact path="/afiliado/:token" component={AffiliatePortalPage} publicPage />
            <WhatsAppsProvider>
              <LoggedInLayout>
                <Guarded>
                <Suspense fallback={<BackdropLoading />}>
                {/* the conversations are the home of the system */}
                <Route exact path="/" component={() => <Redirect to="/tickets" />} isPrivate />
                <Route exact path="/tickets/:ticketId?" component={Tickets} isPrivate />
                <Route exact path="/connections" component={Connections} isPrivate />
                <Route exact path="/contacts" component={Contacts} isPrivate />
                <Route exact path="/users" component={Users} isPrivate managerOnly />
                <Route exact path="/polos" component={Polos} isPrivate managerOnly />
                <Route exact path="/ambientacao" component={Onboarding} isPrivate />
                <Route exact path="/quickAnswers" component={QuickAnswers} isPrivate />
                {/* the general settings moved into Configurações */}
                <Route exact path="/Settings" component={() => <Redirect to="/configuracoes?secao=geral" />} isPrivate adminOnly />
                <Route exact path="/Queues" component={Queues} isPrivate managerOnly />
                <Route exact path="/tags" component={Tags} isPrivate managerOnly />
                <Route exact path="/schedules" component={Schedules} isPrivate />
                <Route exact path="/campaigns" component={Campaigns} isPrivate salesOnly />
                <Route exact path="/chatbot" component={Chatbot} isPrivate managerOnly />
                <Route exact path="/chatbot/:id" component={FlowBuilder} isPrivate managerOnly />
                <Route exact path="/chatbot-antigo" component={LegacyChatbot} isPrivate managerOnly />
                <Route exact path="/ai-agents" component={AiAgents} isPrivate managerOnly />
                <Route exact path="/integrations" component={Webhooks} isPrivate adminOnly />
                <Route exact path="/reports" component={Reports} isPrivate />
                <Route exact path="/monitor" component={LiveMonitor} isPrivate managerOnly />
                <Route exact path="/crm" component={CrmBoard} isPrivate />
                <Route exact path="/crm/painel" component={CrmPanel} isPrivate />
                <Route exact path="/crm/tarefas" component={CrmTasks} isPrivate />
                <Route exact path="/crm/comissoes" component={CrmCommissions} isPrivate />
                <Route exact path="/configuracoes" component={SettingsHub} isPrivate managerOnly />
                <Route exact path="/crm/metas" component={Goals} isPrivate managerOnly />
                <Route exact path="/crm/metas-polos" component={PoloGoals} isPrivate />
                <Route exact path="/afiliados" component={Affiliates} isPrivate />
                <Route exact path="/crm/config" component={CrmSettings} isPrivate managerOnly />
                </Suspense>
                </Guarded>
              </LoggedInLayout>
            </WhatsAppsProvider>
          </Switch>
          <ToastContainer position="top-right" autoClose={4500} newestOnTop pauseOnHover draggable closeOnClick limit={4} />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
