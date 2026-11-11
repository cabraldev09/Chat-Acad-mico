import Model from "./BaseModel";
import {
  AfterSave,
  AfterDestroy,
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
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

  // who ticked it
  @ForeignKey(() => User)
  @Column
  doneById: number;

  @BelongsTo(() => User, "doneById")
  doneBy: User;

  @ForeignKey(() => Lead)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User, "userId")
  user: User;

  @Column
  automationKey: string;

  @AfterSave
  @AfterDestroy
  static async syncFollowUp(task: LeadTask, options: any): Promise<void> {
    const { syncLeadFollowUp } = await import("../services/CrmServices/Tasks");
    await syncLeadFollowUp(task.leadId, options?.transaction);
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadTask;
