import WebhookDelivery from "../models/WebhookDelivery";
import { transactionContext } from "../helpers/TransactionContext";
import { Sequelize } from "sequelize-typescript";
import User from "../models/User";
import Setting from "../models/Setting";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import ContactCustomField from "../models/ContactCustomField";
import Message from "../models/Message";
import Queue from "../models/Queue";
import WhatsappQueue from "../models/WhatsappQueue";
import UserQueue from "../models/UserQueue";
import QuickAnswer from "../models/QuickAnswer";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import ContactTag from "../models/ContactTag";
import ApiToken from "../models/ApiToken";
import Webhook from "../models/Webhook";
import Schedule from "../models/Schedule";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Campaign from "../models/Campaign";
import CampaignShipping from "../models/CampaignShipping";
import ChatbotNode from "../models/ChatbotNode";
import ChatFlow from "../models/ChatFlow";
import ChatFlowRun from "../models/ChatFlowRun";
import ChatFlowStat from "../models/ChatFlowStat";
import AutomationTrigger from "../models/AutomationTrigger";
import ClientError from "../models/ClientError";
import PasswordReset from "../models/PasswordReset";
import Student from "../models/Student";
import StudentToken from "../models/StudentToken";
import CurricularAnalysis from "../models/CurricularAnalysis";
import AcademicAnalysis from "../models/AcademicAnalysis";
import CommercialGrade from "../models/CommercialGrade";
import AiAgent from "../models/AiAgent";
import LeadStage from "../models/LeadStage";
import Course from "../models/Course";
import Lead from "../models/Lead";
import LeadActivity from "../models/LeadActivity";
import LeadTask from "../models/LeadTask";
import LeadTag from "../models/LeadTag";
import Institution from "../models/Institution";
import ProposalTemplate from "../models/ProposalTemplate";
import Proposal from "../models/Proposal";
import Payment from "../models/Payment";
import TicketEvent from "../models/TicketEvent";
import TicketPin from "../models/TicketPin";
import KbDocument from "../models/KbDocument";
import KbChunk from "../models/KbChunk";
import AiUsage from "../models/AiUsage";
import AiLearning from "../models/AiLearning";
import Polo from "../models/Polo";
import PoloMember from "../models/PoloMember";
import Goal from "../models/Goal";
import GoalMember from "../models/GoalMember";
import GoalPolo from "../models/GoalPolo";
import ProposalTemplateInstitution from "../models/ProposalTemplateInstitution";
import Affiliate from "../models/Affiliate";
import AffiliateCampaign from "../models/AffiliateCampaign";
import AffiliateMaterial from "../models/AffiliateMaterial";
import AffiliateAudience from "../models/AffiliateAudience";
import AffiliateClick from "../models/AffiliateClick";
import LeadReminderLog from "../models/LeadReminderLog";
import LeadDocument from "../models/LeadDocument";
import MarketingSpend from "../models/MarketingSpend";
import NpsSurvey from "../models/NpsSurvey";
import RetentionMessage from "../models/RetentionMessage";
import AffiliateBonus from "../models/AffiliateBonus";

// eslint-disable-next-line
const dbConfig = require("../config/database");
// import dbConfig from "../config/database";

Sequelize.useCLS(transactionContext as any);
const sequelize = new Sequelize(dbConfig);

const models = [
  WebhookDelivery,
  User,
  Contact,
  Ticket,
  Message,
  Whatsapp,
  ContactCustomField,
  Setting,
  Queue,
  WhatsappQueue,
  UserQueue,
  QuickAnswer,
  Tag,
  TicketTag,
  ContactTag,
  ApiToken,
  Webhook,
  Schedule,
  ContactList,
  ContactListItem,
  Campaign,
  CampaignShipping,
  ChatbotNode,
  ChatFlow,
  ChatFlowRun,
  ChatFlowStat,
  AutomationTrigger,
  ClientError,
  PasswordReset,
  Student,
  StudentToken,
  CurricularAnalysis,
  AcademicAnalysis,
  CommercialGrade,
  AiAgent,
  LeadStage,
  Course,
  Lead,
  LeadActivity,
  LeadTask,
  LeadTag,
  Institution,
  ProposalTemplate,
  Proposal,
  Payment,
  TicketEvent,
  TicketPin,
  KbDocument,
  KbChunk,
  AiUsage,
  AiLearning,
  Polo,
  PoloMember,
  Goal,
  GoalMember,
  GoalPolo,
  ProposalTemplateInstitution,
  Affiliate,
  AffiliateCampaign,
  AffiliateMaterial,
  AffiliateAudience,
  AffiliateClick,
  LeadReminderLog,
  LeadDocument,
  MarketingSpend,
  NpsSurvey,
  RetentionMessage,
  AffiliateBonus
];

sequelize.addModels(models);

export default sequelize;
