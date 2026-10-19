import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// A milestone of the commercial journey (counted once per lead) or an event worth counting (an unknown question)
@Table
class AgentMetricEvent extends Model<AgentMetricEvent> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  leadId: number;

  @Column
  agentId: number;

  @Column
  flowId: number;

  @AllowNull(false)
  @Column
  event: string;

  @Default(true)
  @Column
  once: boolean;

  @Column(DataType.TEXT)
  meta: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AgentMetricEvent;
