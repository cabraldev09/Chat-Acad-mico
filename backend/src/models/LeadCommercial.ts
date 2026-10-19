import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// The commercial state of a lead that talks to the AI agent: every slot, and what the CRM needs to show (see the migration)
@Table
class LeadCommercial extends Model<LeadCommercial> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  leadId: number;

  @Column
  agentId: number;

  @Column
  flowId: number;

  @Default("{}")
  @Column(DataType.TEXT)
  slots: string;

  @Default("cold")
  @Column
  temperature: string;

  @Default(0)
  @Column
  commercialScore: number;

  @Default(false)
  @Column
  readyForProposal: boolean;

  @Column
  nextAction: string;

  @Column
  lastIntent: string;

  @Column
  followUpReason: string;

  @Column(DataType.DATE)
  followUpAt: Date;

  @Column(DataType.TEXT)
  summary: string;

  @Column
  stageKey: string;

  @Column
  lastNoteHash: string;

  @Column(DataType.DATE)
  lastInboundAt: Date;

  @Column(DataType.DATE)
  lastOutboundAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadCommercial;
