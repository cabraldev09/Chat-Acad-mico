import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";

import Lead from "./Lead";

@Table
class RetentionContact extends Model<RetentionContact> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Lead)
  @AllowNull(false)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  @Column
  userId: number;

  // respondeu | sem_resposta | agendado | resolvido | outro
  @AllowNull(false)
  @Column
  outcome: string;

  @Column(DataType.TEXT)
  note: string;

  @Column(DataType.DATE(6))
  snoozeUntil: Date;
}

export default RetentionContact;
