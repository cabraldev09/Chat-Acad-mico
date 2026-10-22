import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, ForeignKey, Default, DataType } from "sequelize-typescript";

import Ticket from "./Ticket";
import User from "./User";

// What a person asked to send, written in the same transaction that made them the attendant. The outside call (WhatsApp) is made
// from here by the worker, at most once per row: the same clientKey never creates a second row.
@Table
class OutboundMessage extends Model<OutboundMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  // chosen by the screen for each send: a retry of the same request (double click, timeout) finds the row instead of creating another
  @Column
  clientKey: string;

  // { body, quotedMsgId, medias: [{ path, filename, originalname, mimetype, size, caption }], requireOwner }
  @Column(DataType.JSON)
  payload: any;

  // pending | sending | sent | failed
  @Default("pending")
  @Column
  status: string;

  @Default(0)
  @Column
  attempts: number;

  @Column(DataType.DATE)
  nextAttemptAt: Date;

  @Column(DataType.DATE)
  lockedAt: Date;

  @Column
  providerMsgId: string;

  @Column(DataType.TEXT)
  error: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default OutboundMessage;
