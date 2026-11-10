import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, HasMany } from "sequelize-typescript";

import AcademicAnalysis from "./AcademicAnalysis";
import StudentToken from "./StudentToken";

// A student with access to the portal (not a user of the system): identified by the RGM, signs in with a password the
// student chooses through the invitation link.
@Table({ tableName: "Students" })
class Student extends Model<Student> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  rgm: string;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  email: string;

  @Column
  phone: string;

  @Column
  courseName: string;

  @Column
  poloId: number;

  // the tutor (or coordinator) who follows this student: sees and uploads for them
  @Column
  responsibleUserId: number;

  @Column
  leadId: number;

  @Column
  passwordHash: string;

  @Column(DataType.DATE)
  activatedAt: Date;

  @Column(DataType.DATE)
  blockedAt: Date;

  // blocking, changing the e-mail or resetting the password raises it: every older session stops working
  @Default(0)
  @Column
  sessionVersion: number;

  @Column(DataType.DATE)
  lastLoginAt: Date;

  @HasMany(() => AcademicAnalysis)
  analyses: AcademicAnalysis[];

  @HasMany(() => StudentToken)
  tokens: StudentToken[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Student;
