import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// one satisfaction survey sent to a student (see the migration)
@Table
class NpsSurvey extends Model<NpsSurvey> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  leadId: number;

  @Column
  contactId: number;

  @AllowNull(false)
  @Column
  kind: string;

  @Default("sent")
  @Column
  status: string;

  @Column
  score: number;

  @Column(DataType.TEXT)
  comment: string;

  @Default(false)
  @Column
  awaitingComment: boolean;

  @AllowNull(false)
  @Column(DataType.DATE(6))
  sentAt: Date;

  @Column(DataType.DATE(6))
  answeredAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default NpsSurvey;
