import Model from "./BaseModel";
import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  HasMany
} from "sequelize-typescript";

@Table
class Course extends Model<Course> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  level: string;

  @Column
  modality: string;

  @Column
  category: string;

  @Default(8)
  @Column
  semesters: number;

  @Column
  institutionId: number;

  @Column(DataType.DECIMAL(10, 2))
  monthlyFee: number;

  // other names and short forms people use for this course, separated by commas ("RH, gestão de pessoas")
  @Column(DataType.TEXT)
  aliases: string;

  @Default(true)
  @Column
  active: boolean;

  // courses sold in installments (post-graduate, technical, short courses): how long it lasts and how many installments it has
  // (not always until the end); its fees; and whether it is paid at once (a short professional course)
  @Column
  durationMonths: number;

  @Column
  installmentsTotal: number;

  @Column(DataType.DECIMAL(10, 2))
  enrollmentFee: number;

  @Column(DataType.DECIMAL(10, 2))
  certificationFee: number;

  @Default(false)
  @Column
  singlePayment: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Course;
