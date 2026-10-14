import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, BelongsTo } from "sequelize-typescript";
import Goal from "./Goal";

@Table
class GoalMember extends Model<GoalMember> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Goal)
  @Column
  goalId: number;

  @BelongsTo(() => Goal)
  goal: Goal;

  // the name as it goes in the message ("Leila", "Pedro e Dany")
  @AllowNull(false)
  @Column
  label: string;

  // JSON array of CRM user ids whose enrollments count on this line
  @Default("[]")
  @Column(DataType.TEXT)
  userIds: string;

  @Column
  target: number;

  @Default(0)
  @Column
  manualCount: number;

  @Column
  note: string;

  @Default(0)
  @Column
  position: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default GoalMember;
