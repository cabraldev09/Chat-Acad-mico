import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// One change of an agent: the fields that changed and the whole setting after it (never the API key)
@Table
class AiAgentRevision extends Model<AiAgentRevision> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  agentId: number;

  @Column
  userId: number;

  @Column
  note: string;

  // string[] of the labels of what changed
  @AllowNull(false)
  @Column(DataType.TEXT)
  fields: string;

  @AllowNull(false)
  @Column(DataType.TEXT({ length: "long" }))
  snapshot: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiAgentRevision;
