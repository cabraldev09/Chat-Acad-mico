import Model from "./BaseModel";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  HasMany,
  BelongsToMany,
  AutoIncrement,
  Default,
  DataType
} from "sequelize-typescript";

import Contact from "./Contact";
import Message from "./Message";
import Queue from "./Queue";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Tag from "./Tag";
import TicketTag from "./TicketTag";

@Table
class Ticket extends Model<Ticket> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column({ defaultValue: "pending" })
  status: string;

  @Column
  unreadMessages: number;

  @Column
  lastMessage: string;

  // kind of that message (chat, image, audio...) and, in groups, who wrote it: the list previews it like WhatsApp
  @Column
  lastMessageType: string;

  @Column
  lastMessageAuthor: string;

  // when that message was written: the list is ordered by it, like WhatsApp
  @Column(DataType.DATE(6))
  lastMessageAt: Date;

  @Default(false)
  @Column
  isGroup: boolean;

  // pinned at the top of the phone's WhatsApp (kept up to date by the connection)
  @Default(false)
  @Column
  waPinned: boolean;

  @Column
  closedAt: Date;

  @Column
  firstResponseAt: Date;

  // set while the conversation is archived; a new message from the contact clears it
  @Column
  archivedAt: Date;

  // rolling summary of the AI conversation, number of AI answers and what it has collected so far
  @Column(DataType.TEXT)
  aiSummary: string;

  @Default(0)
  @Column
  aiTurns: number;

  @Column(DataType.JSON)
  aiSlots: any;

  // when the bot last nudged a person who stopped answering (cleared by their next message)
  @Column
  botReminderAt: Date;

  @Column
  chatbotNodeId: number;

  @Default(true)
  @Column
  aiActive: boolean;

  @Column
  outOfHoursSentAt: Date;

  // the handoff of the AI agent to the commercial team of the polo (see CommercialServices/Router)
  @Column
  handoffAt: Date;

  @Column
  handoffReason: string;

  @Default(0)
  @Column
  handoffAlerts: number;

  @Column
  handoffAlertedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  // sales | onboarding | support | postsale
  @Default("sales")
  @Column
  segment: string;

  @Column
  leadId: number;

  // the last message and its delivery state, shown in the conversation list
  @Column
  lastMessageId: string;

  @Default(false)
  @Column
  lastMessageFromMe: boolean;

  @Default(0)
  @Column
  lastMessageAck: number;

  // a conversation that existed before the number was connected: kept, but never counted
  @Default(false)
  @Column
  isHistorical: boolean;

  @HasMany(() => Message)
  messages: Message[];

  @BelongsToMany(() => Tag, () => TicketTag)
  tags: Tag[];
}

export default Ticket;
