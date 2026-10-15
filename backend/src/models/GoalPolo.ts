import { Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, BelongsTo } from "sequelize-typescript";
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

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default GoalPolo;
