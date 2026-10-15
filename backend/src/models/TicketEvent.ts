import Model from "./BaseModel";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType
} from "sequelize-typescript";

import Ticket from "./Ticket";
import User from "./User";
import Queue from "./Queue";

// Audit trail of what happened to a ticket (transfers, assignments).
@Table
class TicketEvent extends Model<TicketEvent> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  // "transfer" | "assigned" | "auto_assigned"
  @Column
  type: string;

  @ForeignKey(() => User)
  @Column
  actorId: number;

  @BelongsTo(() => User, "actorId")
  actor: User;

  @ForeignKey(() => Queue)
  @Column
  fromQueueId: number;

  @ForeignKey(() => Queue)
  @Column
  toQueueId: number;

  @BelongsTo(() => Queue, "fromQueueId")
  fromQueue: Queue;

  @BelongsTo(() => Queue, "toQueueId")
  toQueue: Queue;

  @ForeignKey(() => User)
  @Column
  fromUserId: number;

  @ForeignKey(() => User)
  @Column
  toUserId: number;

  @BelongsTo(() => User, "fromUserId")
  fromUser: User;

  @BelongsTo(() => User, "toUserId")
  toUser: User;

  @Column(DataType.TEXT)
  note: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TicketEvent;
