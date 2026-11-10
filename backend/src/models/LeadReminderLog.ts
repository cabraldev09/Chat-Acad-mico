import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// one automatic follow-up already made for a lead (see the migration)
@Table
class LeadReminderLog extends Model<LeadReminderLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  leadId: number;

  @AllowNull(false)
  @Column
  key: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadReminderLog;
