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

  // what the task is: manual | handoff | proposal | transcript | callback | billet | onboarding | onboarding_late | followup | nps |
  // retention | flow | referral | upsell. The automatic ones close by themselves when what they ask for happens (CrmServices/TaskLifecycle).
  @Default("manual")
  @Column
  kind: string;

  // high | normal
  @Default("normal")
  @Column
  priority: string;

  // the conversation it is about (opens straight from the task list)
  @Column
  ticketId: number;

  @Column
  createdById: number;

  // why it closed: done (a person ticked it) | replied | transcript_received | paid | onboarding_done | lead_won | lead_lost
  @Column
  closedReason: string;

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
