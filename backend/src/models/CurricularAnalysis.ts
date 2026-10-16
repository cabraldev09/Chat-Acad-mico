import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// Analysis of a candidate's curricular document: from the PDF to the forecast of the entry (semester by semester).
// Subjects, claims and the computed result are JSON kept as text; the result is recomputed whenever the entry period
// or the first semester changes, never from the PDF again.
@Table({ tableName: "CurricularAnalyses" })
class CurricularAnalysis extends Model<CurricularAnalysis> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  userId: number;

  @Column
  leadId: number;

  @Column
  contactId: number;

  @Column
  candidateName: string;

  @Column
  originalName: string;

  @Column
  fileHash: string;

  @Column
  pageCount: number;

  @Default("COMPLETED")
  @Column
  status: string;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Column
  courseName: string;

  @Column
  matrixLabel: string;

  @Column
  campus: string;

  @Column
  modality: string;

  @Column
  headerEntryPeriod: number;

  @Column
  entryPeriod: number;

  // USER (typed) | DOCUMENT (the header of the PDF)
  @Column
  entryPeriodSource: string;

  @Column
  startTerm: string;

  @Default("[]")
  @Column(DataType.TEXT)
  subjects: string;

  @Default("[]")
  @Column(DataType.TEXT)
  claims: string;

  @Default("[]")
  @Column(DataType.TEXT)
  baseWarnings: string;

  @Column(DataType.TEXT)
  result: string;

  // the result of the commercial service (see the migration 20261113000001)
  @Default("PENDING")
  @Column
  enrollmentStatus: string;

  @Column(DataType.TEXT)
  enrollmentNote: string;

  @Column(DataType.DATE)
  enrollmentUpdatedAt: Date;

  @Column
  enrollmentUpdatedById: number;

  @Column(DataType.DATE)
  enrollmentReanalysisAt: Date;

  @Column(DataType.DATE)
  followUpDueAt: Date;

  @Column(DataType.DATE)
  followUpNotifiedAt: Date;

  @Default(0)
  @Column
  followUpNotificationCount: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CurricularAnalysis;
