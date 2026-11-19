import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

// a change to the period of a goal (e.g. the end postponed), with who did it and why
@Table({ tableName: "GoalChanges" })
export default class GoalChange extends Model<GoalChange> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column goalId: number;
  @Column field: string;
  @Column fromValue: string;
  @Column toValue: string;
  @Column(DataType.TEXT) reason: string;
  @Column userId: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
