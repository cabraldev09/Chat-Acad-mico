import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, ForeignKey } from "sequelize-typescript";
import User from "./User";

@Table
class PasswordReset extends Model<PasswordReset> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column
  userId: number;

  @AllowNull(false)
  @Column
  tokenHash: string;

  @AllowNull(false)
  @Column(DataType.DATE)
  expiresAt: Date;

  @Column(DataType.DATE)
  usedAt: Date;

  @Column
  requestIp: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default PasswordReset;
