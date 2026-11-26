import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// one conversation to be read by a cheap model, by the system or by an outside worker (see the migration and services/ReadingServices)
@Table
class ConversationReading extends Model<ConversationReading> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  kind: string;

  @AllowNull(false)
  @Column
  ref: string;

  @Column
  ticketId: number;

  @Column
  leadId: number;

  @Column
  userId: number;

  @Column
  poloId: number;

  @Default("pendente")
  @Column
  status: string;

  @Column
  claimedBy: string;

  @Column(DataType.DATE)
  claimedUntil: Date;

  @Column
  doneBy: string;

  @Column(DataType.DATE)
  doneAt: Date;

  @Default(0)
  @Column
  attempts: number;

  @Column(DataType.TEXT)
  result: string;

  @Column
  error: string;

  @Column
  model: string;

  @Column
  tokens: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ConversationReading;
