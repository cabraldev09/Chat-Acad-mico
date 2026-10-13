import { Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, ForeignKey } from "sequelize-typescript";

import Ticket from "./Ticket";
import User from "./User";

@Table
class TicketPin extends Model<TicketPin> {
  @PrimaryKey
  @ForeignKey(() => User)
  @Column
  userId: number;

  @PrimaryKey
  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TicketPin;
