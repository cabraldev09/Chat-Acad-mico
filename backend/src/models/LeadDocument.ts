import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// one document the student has to deliver (see the migration)
@Table
class LeadDocument extends Model<LeadDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  leadId: number;

  @AllowNull(false)
  @Column
  name: string;

  @Default("pending")
  @Column
  status: string;

  @Default(0)
  @Column
  position: number;

  @Column(DataType.DATE(6))
  receivedAt: Date;

  @Column
  receivedBy: number;

  @Column(DataType.TEXT)
  note: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadDocument;
