import { signedFileUrl } from "../helpers/SignedFile";
import Model from "./BaseModel";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
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

  // what a voice note said (written down once by the transcription), read by the AI in the turns after
  @Column(DataType.TEXT)
  transcript: string;

  // when the transcription was tried (once per voice note, also when it had no speech): see AiServices/HumanTranscription
  @Column(DataType.DATE)
  transcribeTriedAt: Date;

  @Column(DataType.TEXT)
  get mediaUrl(): string | null {
    if (this.getDataValue("mediaUrl")) {
      return signedFileUrl(String(this.getDataValue("mediaUrl")), this.id);
    }
    return null;
  }

  @Column
  mediaType: string;

  // the retention policy deleted the file of this message (the transcript of a voice note stays): see SystemServices/ContentRetention
  @Column(DataType.DATE)
  mediaPurgedAt: Date;

  // the retention policy deleted the text, the transcript and the file of this message (the record of the message stays)
  @Column(DataType.DATE)
  bodyPurgedAt: Date;

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

  // forwarded on WhatsApp ("Encaminhada", as on the phone)
  @Default(false)
  @Column
  isForwarded: boolean;

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
