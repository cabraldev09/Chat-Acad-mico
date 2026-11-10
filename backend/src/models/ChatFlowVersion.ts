import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// one publication of a flow (or of an agent in blocks): the graph as it was, to read and to restore
@Table
class ChatFlowVersion extends Model<ChatFlowVersion> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  flowId: number;

  @AllowNull(false)
  @Column
  version: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  graph: string;

  @Column
  note: string;

  @Column
  publishedBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ChatFlowVersion;
