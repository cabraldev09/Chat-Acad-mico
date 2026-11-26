import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, BelongsTo } from "sequelize-typescript";
import User from "./User";

// A person asks the management for more messages in the month (past their quota of sends); the management approves (with how many)
// or denies. An approved request adds to that person's quota of that month only.
@Table({ tableName: "SendReleases" })
class SendRelease extends Model<SendRelease> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column
  userId: number;

  @BelongsTo(() => User, "userId")
  user: User;

  // "YYYY-MM", in the app's timezone
  @AllowNull(false)
  @Column
  month: string;

  @AllowNull(false)
  @Column
  requested: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  reason: string;

  // what was being sent when the person asked: { type: "aviso" | "campanha", name, recipients }
  @Column(DataType.JSONB)
  context: any;

  @Default("pending")
  @Column
  status: string;

  @Column
  granted: number;

  @ForeignKey(() => User)
  @Column
  decidedBy: number;

  @BelongsTo(() => User, "decidedBy")
  decider: User;

  @Column
  decidedAt: Date;

  @Column
  decisionNote: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default SendRelease;
