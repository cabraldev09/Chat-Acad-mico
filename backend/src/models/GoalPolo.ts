import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, BelongsTo
} from "sequelize-typescript";
import Goal from "./Goal";
import Polo from "./Polo";

@Table
class GoalPolo extends Model<GoalPolo> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Goal)
  @Column
  goalId: number;

  @BelongsTo(() => Goal)
  goal: Goal;

  @ForeignKey(() => Polo)
  @Column
  poloId: number;

  @BelongsTo(() => Polo)
  polo: Polo;

  @Column
  target: number;

  // enrollments that are not in the CRM (added by hand)
  @AllowNull(false)
  @Default(0)
  @Column
  manualCount: number;

  // cancelled or transferred after enrolling (typed by the administration)
  @AllowNull(false)
  @Default(0)
  @Column
  canceled: number;

  // JSON array with the target of each month of the period
  @Column(DataType.TEXT)
  monthly: string;

  // JSON object {"2026-10": n} with hand adjustments of a month
  @Column(DataType.TEXT)
  manualMonthly: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default GoalPolo;
