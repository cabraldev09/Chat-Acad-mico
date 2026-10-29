import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Redirect, Switch, useLocation } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import LoggedInLayout from "../layout";
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
const Grades = lazy(() => import("../pages/Grades"));
const CurricularAnalysis = lazy(() => import("../pages/CurricularAnalysis"));
const AcademicAnalysis = lazy(() => import("../pages/AcademicAnalysis"));
const Students = lazy(() => import("../pages/Students"));
// the student portal has its own login and no menu of the team
const PortalHome = lazy(() => import("../pages/Portal"));
const PortalLogin = lazy(() => import("../pages/Portal").then((m) => ({ default: m.PortalLogin })));
const PortalActivate = lazy(() => import("../pages/Portal").then((m) => ({ default: m.PortalActivate })));
const NotFound = lazy(() => import("../pages/NotFound/"));
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
const AiAgentCentral = lazy(() => import("../pages/AiAgents/Central"));
const Webhooks = lazy(() => import("../pages/Webhooks/"));
const Reports = lazy(() => import("../pages/Reports/"));
const CommercialCenter = lazy(() => import("../pages/CommercialCenter/"));
const CrmBoard = lazy(() => import("../pages/CRM/Board"));
const CrmPanel = lazy(() => import("../pages/CRM/Panel"));
const CrmTasks = lazy(() => import("../pages/CRM/Tasks"));
const CrmCommissions = lazy(() => import("../pages/CRM/Commissions"));
const Goals = lazy(() => import("../pages/Goals"));
const PoloGoals = lazy(() => import("../pages/PoloGoals"));
const Retention = lazy(() => import("../pages/Retention"));
const CoursePage = lazy(() => import("../pages/CoursePage"));
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

const inPage = (Page) => (props) => (
  <PageErrorBoundary>
    <Suspense fallback={<BackdropLoading />}>
      <Page {...props} />
    </Suspense>
  </PageErrorBoundary>
);
const PortalLoginPage = inPage(PortalLogin);
const CoursePageRoute = inPage(CoursePage);
// the public site of the product (landing, privacy, terms, data deletion): no login, its own look
const SiteLandingLazy = lazy(() => import("../pages/Site/Landing"));
const SitePrivacyLazy = lazy(() => import("../pages/Site/Legal").then((m) => ({ default: m.Privacy })));
const SiteTermsLazy = lazy(() => import("../pages/Site/Legal").then((m) => ({ default: m.Terms })));
const SiteDeletionLazy = lazy(() => import("../pages/Site/Legal").then((m) => ({ default: m.DataDeletion })));
const SiteLanding = inPage(SiteLandingLazy);
const SitePrivacy = inPage(SitePrivacyLazy);
const SiteTerms = inPage(SiteTermsLazy);
const SiteDeletion = inPage(SiteDeletionLazy);
const PortalActivatePage = inPage(PortalActivate);
const PortalHomePage = inPage(PortalHome);

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
            <Route exact path="/esqueci-a-senha" component={ForgotPassword} publicPage />
            <Route exact path="/redefinir-senha/:token" component={ResetPassword} publicPage />
            <Route exact path="/afiliado/:token" component={AffiliatePortalPage} publicPage />
            <Route exact path="/curso/:slug" component={CoursePageRoute} publicPage />
            <Route exact path="/site" component={SiteLanding} publicPage />
            <Route exact path="/privacidade" component={SitePrivacy} publicPage />
            <Route exact path="/termos" component={SiteTerms} publicPage />
            <Route exact path="/exclusao-de-dados" component={SiteDeletion} publicPage />
            <Route exact path="/portal/login" component={PortalLoginPage} publicPage />
            <Route exact path="/portal/ativar/:token" component={PortalActivatePage} publicPage />
            <Route exact path="/portal" component={PortalHomePage} publicPage />
            <WhatsAppsProvider>
              <LoggedInLayout>
                <Guarded>
                <Suspense fallback={<BackdropLoading />}>
                <Switch>
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
                <Route exact path="/ai-agents/blocos/:id" component={FlowBuilder} isPrivate managerOnly />
                <Route exact path="/ai-agents/:id/central" component={AiAgentCentral} isPrivate managerOnly />
                {/* the old address of the improvement board: inside the layout every Route renders on its own, so the redirect needs its own path */}
                <Route exact path="/ai-agents/:id/melhorar" component={({ match }) => <Redirect to={`/ai-agents/${match.params.id}/central?secao=ensinar`} />} isPrivate managerOnly />
                <Route exact path="/chatbot-antigo" component={LegacyChatbot} isPrivate managerOnly />
                <Route exact path="/ai-agents" component={AiAgents} isPrivate managerOnly />
                <Route exact path="/integrations" component={Webhooks} isPrivate adminOnly />
                <Route exact path="/reports" component={Reports} isPrivate />
                <Route exact path="/gestao-comercial" component={CommercialCenter} isPrivate managerOnly />
                <Route exact path="/crm" component={CrmBoard} isPrivate />
                <Route exact path="/crm/painel" component={CrmPanel} isPrivate />
                <Route exact path="/crm/tarefas" component={CrmTasks} isPrivate />
                <Route exact path="/crm/comissoes" component={CrmCommissions} isPrivate salesOnly />
                <Route exact path="/configuracoes" component={SettingsHub} isPrivate managerOnly />
                <Route exact path="/crm/metas" component={Goals} isPrivate managerOnly />
                <Route exact path="/crm/metas-polos" component={PoloGoals} isPrivate />
                <Route exact path="/crm/retencao" component={Retention} isPrivate retentionOnly />
                <Route exact path="/afiliados" component={Affiliates} isPrivate salesOnly />
                <Route exact path="/grades" component={Grades} isPrivate />
                <Route exact path="/analise-curricular/:id?" component={CurricularAnalysis} isPrivate />
                <Route exact path="/analise-academica/:id?" component={AcademicAnalysis} isPrivate academicOnly />
                <Route exact path="/alunos" component={Students} isPrivate academicOnly />
                <Route exact path="/crm/config" component={CrmSettings} isPrivate managerOnly />
                {/* any other address: a page that says so (before, an empty screen) */}
                <Route component={NotFound} isPrivate />
                </Switch>
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
