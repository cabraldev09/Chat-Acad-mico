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
class LeadActivity extends Model<LeadActivity> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  // note | call | whatsapp | email | visit | stage | task | system
  @AllowNull(false)
  @Column
  type: string;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.TEXT)
  meta: string;

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

export default LeadActivity;
