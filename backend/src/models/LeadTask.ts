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

import Lead from "./Lead";
import User from "./User";

@Table
class LeadTask extends Model<LeadTask> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  // ligar | whatsapp | email | visita | proposta | documentos | outro
  @Default("ligar")
  @Column
  type: string;

  @AllowNull(false)
  @Column
  dueAt: Date;

  @Column
  doneAt: Date;

  @Column
  notifiedAt: Date;

  @ForeignKey(() => Lead)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadTask;
