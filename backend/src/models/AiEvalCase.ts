import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// A conversation (up to a message of the person) and what the agent's next answer must, or must not, say
@Table
class AiEvalCase extends Model<AiEvalCase> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  agentId: number;

  @AllowNull(false)
  @Column
  name: string;

  // [{ role, content }]
  @AllowNull(false)
  @Column(DataType.TEXT)
  messages: string;

  // { mustContain: string[], mustNotContain: string[], outcome?: "answer" | "handoff" | "unknown" }
  @AllowNull(false)
  @Column(DataType.TEXT)
  expect: string;

  @Column
  lastStatus: string;

  @Column(DataType.TEXT)
  lastText: string;

  @Column(DataType.TEXT)
  lastReasons: string;

  @Column
  lastRunAt: Date;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiEvalCase;
