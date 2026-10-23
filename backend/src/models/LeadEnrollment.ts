import Model from "./BaseModel";
import { Table, Column, PrimaryKey, AutoIncrement, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";

import Lead from "./Lead";

// An enrollment after the first one of the same student (the first one lives on the lead itself).
@Table
class LeadEnrollment extends Model<LeadEnrollment> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Lead)
  @AllowNull(false)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  // the consultant who owned the lead when the enrollment was confirmed (the one the enrollment counts for)
  @Column
  ownerId: number;

  @Column
  poloId: number;

  @Column
  tutorId: number;

  @Column
  actorId: number;

  @Column
  courseId: number;

  @Column
  courseName: string;

  @Column
  note: string;

  @AllowNull(false)
  @Column
  enrolledAt: Date;
}

export default LeadEnrollment;
