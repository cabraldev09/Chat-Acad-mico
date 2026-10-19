import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// How a course is delivered under the rules of the MEC, in the words the company approved. What is not filled in is not affirmed.
@Table
class CourseRegulation extends Model<CourseRegulation> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  courseId: number;

  // null = every intake period
  @Column
  intakeTerm: string;

  @Column
  mecImpacted: boolean;

  @Column
  regulation: string;

  @Column(DataType.DECIMAL(5, 2))
  percentualPresencial: number;

  @Column(DataType.DECIMAL(5, 2))
  percentualSincrono: number;

  @Column
  teoriaAoVivo: boolean;

  @Column
  praticaPresencial: boolean;

  @Column
  cronogramaPraticasDefinido: boolean;

  @Column
  transitionStatus: string;

  @Column
  currentDelivery: string;

  @Column
  futureDelivery: string;

  @Column(DataType.TEXT)
  transitionNote: string;

  @Column(DataType.TEXT)
  commercialApprovedText: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CourseRegulation;
