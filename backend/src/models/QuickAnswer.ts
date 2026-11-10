import Model from "./BaseModel";
import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  AutoIncrement
} from "sequelize-typescript";

@Table
class QuickAnswer extends Model<QuickAnswer> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column(DataType.TEXT)
  shortcut: string;

  @Column(DataType.TEXT)
  message: string;

  // who made it (null: the management's)
  @Column
  userId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default QuickAnswer;
