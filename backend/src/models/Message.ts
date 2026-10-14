import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  Default,
  BelongsTo,
  ForeignKey
} from "sequelize-typescript";
import Contact from "./Contact";
import Ticket from "./Ticket";

@Table
class Message extends Model<Message> {
  @PrimaryKey
  @Column
  id: string;

  @Default(0)
  @Column
  ack: number;

  @Default(false)
  @Column
  read: boolean;

  @Default(false)
  @Column
  fromMe: boolean;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.TEXT)
  get mediaUrl(): string | null {
    if (this.getDataValue("mediaUrl")) {
      const base = process.env.BACKEND_URL || "";
      const port = process.env.PROXY_PORT;
      // https hosts (Railway) already answer on the default port
      const origin = /^https:\/\//.test(base) || !port ? base : `${base}:${port}`;
      return `${origin}/public/${this.getDataValue("mediaUrl")}`;
    }
    return null;
  }

  @Column
  mediaType: string;

  @Default(false)
  @Column
  isDeleted: boolean;

  @Default(false)
  @Column
  isEdited: boolean;

  // animated GIF (a looping video)
  @Default(false)
  @Column
  isGif: boolean;

  @Default(false)
  @Column
  starred: boolean;

  @Column(DataType.TEXT)
  reactions: string;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @ForeignKey(() => Message)
  @Column
  quotedMsgId: string;

  @BelongsTo(() => Message, "quotedMsgId")
  quotedMsg: Message;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact, "contactId")
  contact: Contact;
}

export default Message;
