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
import Polo from "../models/Polo";
import PoloMember from "../models/PoloMember";

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
  Polo,
  PoloMember
];

sequelize.addModels(models);

export default sequelize;
