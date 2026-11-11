import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement } from "sequelize-typescript";

// One line of the trail of an analysis (curricular or academic): who did what, with the value before and after.
@Table({ tableName: "AnalysisEvents" })
class AnalysisEvent extends Model<AnalysisEvent> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  // CURRICULAR | ACADEMIC
  @Column
  kind: string;

  @Column
  analysisId: number;

  @Column
  userId: number;

  // subject_edited | subject_added | subject_removed | polo_changed | entry_changed ...
  @Column
  action: string;

  @Column
  subjectName: string;

  @Column(DataType.TEXT)
  before: string;

  @Column(DataType.TEXT)
  after: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AnalysisEvent;
