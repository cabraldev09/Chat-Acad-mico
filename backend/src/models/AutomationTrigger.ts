import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default
} from "sequelize-typescript";

@Table
class AutomationTrigger extends Model<AutomationTrigger> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Default(true)
  @Column
  active: boolean;

  // see services/FlowServices/Events.ts for the catalog
  @AllowNull(false)
  @Column
  event: string;

  @Default("{}")
  @Column(DataType.TEXT)
  config: string;

  @Column
  flowId: number;

  @Default(0)
  @Column
  runCount: number;

  @Column(DataType.DATE)
  lastRunAt: Date;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AutomationTrigger;
