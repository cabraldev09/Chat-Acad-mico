import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// one message of the retention area sent to a student (see the migration)
@Table
class RetentionMessage extends Model<RetentionMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  leadId: number;

  @Column
  contactId: number;

  @Column
  name: string;

  @Column
  number: string;

  @AllowNull(false)
  @Column
  kind: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  body: string;

  @Column
  surveyId: number;

  @Column
  userId: number;

  @Default("sent")
  @Column
  status: string;

  @Column(DataType.TEXT)
  error: string;

  @Default(false)
  @Column
  withButtons: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default RetentionMessage;
