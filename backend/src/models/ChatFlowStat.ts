import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, Default
} from "sequelize-typescript";

@Table
class ChatFlowStat extends Model<ChatFlowStat> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  flowId: number;

  @Column
  nodeId: string;

  @Default(0)
  @Column
  entered: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ChatFlowStat;
