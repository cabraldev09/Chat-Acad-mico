import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// the enrollment form a lead fills in by a personal link (see the migration); data and files are sealed (services/CrmServices/EnrollmentForm)
@Table
class EnrollmentForm extends Model<EnrollmentForm> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  leadId: number;

  @AllowNull(false)
  @Column
  token: string;

  @Column(DataType.TEXT)
  data: string;

  @Column(DataType.TEXT)
  files: string;

  @Default(0)
  @Column
  progress: number;

  @Column(DataType.DATE)
  consentAt: Date;

  @Column(DataType.DATE)
  submittedAt: Date;

  @Column(DataType.DATE)
  lastSavedAt: Date;

  @Column(DataType.DATE)
  sentAt: Date;

  @Column(DataType.DATE)
  expiresAt: Date;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default EnrollmentForm;
