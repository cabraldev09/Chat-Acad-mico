import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  HasMany
} from "sequelize-typescript";

import Ticket from "./Ticket";
import Tag from "./Tag";

@Table
class TicketTag extends Model<TicketTag> {
  @ForeignKey(() => Ticket)
  @PrimaryKey
  @Column
  ticketId: number;

  @ForeignKey(() => Tag)
  @PrimaryKey
  @Column
  tagId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TicketTag;
