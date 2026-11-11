import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, Default } from "sequelize-typescript";

// A print of a course (what the institution approved to say and the share of presential classes), as read by the AI and confirmed by the management.
@Table({ tableName: "CourseMaterials" })
class CourseMaterial extends Model<CourseMaterial> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  courseId: number;

  @Default("print")
  @Column
  kind: string;

  // random name inside PUBLIC_DIR/course-materials (served only by the authenticated route)
  @Column
  fileName: string;

  @Column
  originalName: string;

  @Column
  mime: string;

  @Column
  size: number;

  // pending | read | failed | manual: how the reading by the AI went
  @Default("pending")
  @Column
  readStatus: string;

  @Column(DataType.TEXT)
  readNote: string;

  @Column(DataType.TEXT)
  readText: string;

  @Column
  readFormat: string;

  @Column(DataType.DECIMAL(5, 2))
  readPercent: number;

  @Column(DataType.DECIMAL(5, 2))
  readSyncPercent: number;

  // pending (waiting for the management) | confirmed | discarded
  @Default("pending")
  @Column
  status: string;

  @Column
  uploadedById: number;

  @Column
  confirmedById: number;

  @Column(DataType.DATE(6))
  confirmedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CourseMaterial;
