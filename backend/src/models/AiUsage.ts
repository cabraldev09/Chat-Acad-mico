import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default
} from "sequelize-typescript";

@Table({ tableName: "AiUsage" })
class AiUsage extends Model<AiUsage> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  agentId: number;

  @Column
  ticketId: number;

  // the agent in blocks: the flow and the block (stage) that spent it
  @Column
  flowId: number;

  @Column
  nodeId: string;

  @Column
  latencyMs: number;

  @Column
  leadId: number;

  @AllowNull(false)
  @Column
  model: string;

  // reply | summary | test
  @Default("reply")
  @Column
  kind: string;

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
  cacheWriteTokens: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiUsage;
