import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// One class (turma) of a course with what the institution confirmed for it. What is not filled in is "not confirmed": the agent never fills the gap.
@Table
class CourseCohort extends Model<CourseCohort> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  courseId: number;

  // null = every polo
  @Column
  poloId: number;

  @AllowNull(false)
  @Column
  label: string;

  @Column
  intakeTerm: string;

  @Column(DataType.DATEONLY)
  intakeDate: string;

  // EAD | SEMIPRESENCIAL | PRESENCIAL
  @Column
  contractedModality: string;

  // ead_pre_decreto | semipresencial_transicao | semipresencial_pleno | presencial | nao_definido
  @Column
  transitionRegime: string;

  @Column(DataType.TEXT)
  transitionNote: string;

  @Column(DataType.TEXT)
  expectedCalendar: string;

  @Column(DataType.DATEONLY)
  presencialStart: string;

  @Column(DataType.TEXT)
  syncRules: string;

  @Column(DataType.TEXT)
  practiceSchedule: string;

  @Column
  practiceDefined: boolean;

  // nao_definido | parcial | definido
  @Column
  assessmentsStatus: string;

  @Column(DataType.TEXT)
  assessmentsNote: string;

  @Column(DataType.TEXT)
  activityLocation: string;

  @Default(false)
  @Column
  published: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CourseCohort;
