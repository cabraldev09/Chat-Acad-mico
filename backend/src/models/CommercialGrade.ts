import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// A commercial matrix ("grade"): what the commercial team tells a candidate about a course, and the PDF to send.
@Table({ tableName: "CommercialGrades" })
class CommercialGrade extends Model<CommercialGrade> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  courseName: string;

  @Column
  modality: string;

  // AAAA.S: the term of the matrix
  @Column
  curriculumTerm: string;

  @Column
  degree: string;

  @Column
  knowledgeArea: string;

  @Column
  durationSemesters: number;

  @Default("[]")
  @Column(DataType.TEXT)
  courseTracks: string;

  @Column(DataType.TEXT)
  internshipInfo: string;

  @Default(false)
  @Column
  hasTcc: boolean;

  @Column
  totalInternshipHours: number;

  @Column
  totalCourseHours: number;

  @Column(DataType.TEXT)
  whatsappSummary: string;

  // false when the PDF did not bring everything (course, total hours, duration): the team checks it
  @Default(true)
  @Column
  complete: boolean;

  @AllowNull(false)
  @Column
  contentHash: string;

  @AllowNull(false)
  @Column
  catalogKey: string;

  @Column
  originalName: string;

  // file inside the uploads folder (grades/<hash>.pdf)
  @AllowNull(false)
  @Column
  fileName: string;

  @Column
  sizeBytes: number;

  @Column
  uploadedById: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CommercialGrade;
