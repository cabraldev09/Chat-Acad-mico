import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";

import Lead from "./Lead";
import Course from "./Course";
import ProposalTemplate from "./ProposalTemplate";
import Institution from "./Institution";
import User from "./User";

@Table
class Proposal extends Model<Proposal> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  token: string;

  // draft | sent | accepted | declined
  @Default("draft")
  @Column
  status: string;

  @Column
  courseName: string;

  @Column(DataType.DECIMAL(10, 2))
  grossFee: number;

  @Column(DataType.DECIMAL(10, 2))
  firstMonthly: number;

  @Column(DataType.DECIMAL(5, 2))
  bolsaPct: number;

  @AllowNull(false)
  @Column(DataType.TEXT({ length: "long" }))
  params: string;

  @Column
  sentAt: Date;

  @Column
  viewedAt: Date;

  @ForeignKey(() => Lead)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  @ForeignKey(() => Course)
  @Column
  courseId: number;

  @BelongsTo(() => Course)
  course: Course;

  @ForeignKey(() => ProposalTemplate)
  @Column
  templateId: number;

  @BelongsTo(() => ProposalTemplate)
  template: ProposalTemplate;

  @ForeignKey(() => Institution)
  @Column
  institutionId: number;

  @BelongsTo(() => Institution)
  institution: Institution;

  @ForeignKey(() => User)
  @Column
  createdBy: number;

  @BelongsTo(() => User, "createdBy")
  author: User;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Proposal;
