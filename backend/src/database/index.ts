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
import ProposalTemplateInstitution from "../models/ProposalTemplateInstitution";
import Affiliate from "../models/Affiliate";
import AffiliateCampaign from "../models/AffiliateCampaign";
import AffiliateMaterial from "../models/AffiliateMaterial";
import AffiliateAudience from "../models/AffiliateAudience";
import AffiliateBonus from "../models/AffiliateBonus";

// eslint-disable-next-line
const dbConfig = require("../config/database");
// import dbConfig from "../config/database";

const sequelize = new Sequelize(dbConfig);

const models = [
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
  ProposalTemplateInstitution,
  Affiliate,
  AffiliateCampaign,
  AffiliateMaterial,
  AffiliateAudience,
  AffiliateBonus
];

sequelize.addModels(models);

export default sequelize;
