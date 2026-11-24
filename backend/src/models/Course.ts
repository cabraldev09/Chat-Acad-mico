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

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Course;
