import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, Default } from "sequelize-typescript";

// One turn of an AI stage: what it cost and what it did
@Table
class AgentTurnLog extends Model<AgentTurnLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  agentId: number;

  @Column
  flowId: number;

  @Column
  nodeId: string;

  @Column
  ticketId: number;

  @Column
  leadId: number;

  @Column
  intent: string;

  @Default(false)
  @Column
  deterministic: boolean;

  @Default(0)
  @Column
  llmCalls: number;

  @Default(0)
  @Column
  toolCalls: number;

  @Default(0)
  @Column
  cacheHits: number;

  @Default(0)
  @Column
  inputTokens: number;

  @Default(0)
  @Column
  outputTokens: number;

  @Default(0)
  @Column
  cacheReadTokens: number;

  @Default(0)
  @Column
  latencyMs: number;

  @Column
  outcome: string;

  @Column
  model: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AgentTurnLog;
