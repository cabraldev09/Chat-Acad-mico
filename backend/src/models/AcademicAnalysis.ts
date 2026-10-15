import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, BelongsTo } from "sequelize-typescript";

import Student from "./Student";

// Analysis of a student's extract or history: where the student is, what is pending and when the course ends.
// For a student of the portal each real change creates a new version (the older ones stay as the history).
@Table({ tableName: "AcademicAnalyses" })
class AcademicAnalysis extends Model<AcademicAnalysis> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  userId: number;

  @ForeignKey(() => Student)
  @Column
  studentId: number;

  @BelongsTo(() => Student)
  student: Student;

  @Column
  leadId: number;

  @Column
  contactId: number;

  // STAFF_UPLOAD | STUDENT_UPLOAD | CORRECTION
  @Default("STAFF_UPLOAD")
  @Column
  origin: string;

  @Column
  originalName: string;

  @Column
  fileHash: string;

  // the text of the PDF, normalized: the same document sent again under another name is recognized
  @Column
  contentHash: string;

  // the academic facts only (disciplines, periods, situations): equal facts = no new version
  @Column
  factsHash: string;

  @Column
  documentType: string;

  @Column
  rgm: string;

  @Column
  studentName: string;

  @Column
  courseName: string;

  @Column
  currentPeriod: number;

  @Default(false)
  @Column
  currentPeriodConfirmed: boolean;

  @Column
  status: string;

  @Default(1)
  @Column
  version: number;

  @Default(true)
  @Column
  isCurrent: boolean;

  @Column(DataType.TEXT)
  changeSummary: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  snapshot: string;

  @Column(DataType.TEXT)
  forecast: string;

  @Column(DataType.TEXT)
  message: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AcademicAnalysis;
