import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// one thing left pending in a tutoring conversation (see the migration and services/TutoriaServices/Issues)
@Table
class TutoringIssue extends Model<TutoringIssue> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  ticketId: number;

  @Column
  leadId: number;

  @Column
  tutorId: number;

  @Column
  institutionId: number;

  @Default("outro")
  @Column
  kind: string;

  @AllowNull(false)
  @Column
  summary: string;

  @Column
  idea: string;

  @Column
  protocolNumber: string;

  @Column
  protocolName: string;

  @Default("aberta")
  @Column
  status: string;

  @Default("ia")
  @Column
  source: string;

  @Column(DataType.DATE)
  detectedAt: Date;

  @Column(DataType.DATE)
  resolvedAt: Date;

  @Column
  resolvedBy: number;

  @Column
  lastMessageId: string;

  @Column
  model: string;

  @Column
  tokens: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TutoringIssue;
