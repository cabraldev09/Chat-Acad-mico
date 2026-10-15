import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";

import Student from "./Student";

// invitation (first access) and password recovery links: only the hash is kept, one use, short life
@Table({ tableName: "StudentTokens" })
class StudentToken extends Model<StudentToken> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Student)
  @AllowNull(false)
  @Column
  studentId: number;

  @BelongsTo(() => Student)
  student: Student;

  // invite | reset
  @AllowNull(false)
  @Column
  kind: string;

  @AllowNull(false)
  @Column
  tokenHash: string;

  @AllowNull(false)
  @Column(DataType.DATE)
  expiresAt: Date;

  @Column(DataType.DATE)
  usedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default StudentToken;
