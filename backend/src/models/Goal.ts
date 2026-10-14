import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, AllowNull, Default, HasMany } from "sequelize-typescript";
import GoalMember from "./GoalMember";

@Table
class Goal extends Model<Goal> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  title: string;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  startsOn: string;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  endsOn: string;

  // active | archived
  @Default("active")
  @Column
  status: string;

  @Column
  createdBy: number;

  @HasMany(() => GoalMember)
  members: GoalMember[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Goal;
