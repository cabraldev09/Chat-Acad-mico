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
  BelongsTo,
  BelongsToMany,
  HasMany
} from "sequelize-typescript";

import Course from "./Course";
import LeadStage from "./LeadStage";
import User from "./User";
import Contact from "./Contact";
import Tag from "./Tag";
import LeadTag from "./LeadTag";
import LeadActivity from "./LeadActivity";
import LeadTask from "./LeadTask";

@Table
class Lead extends Model<Lead> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  phone: string;

  @Column
  email: string;

  @Column
  city: string;

  @Column
  state: string;

  @Column
  modality: string;

  @Column
  shift: string;

  @Column
  entryTerm: string;

  @Column
  educationLevel: string;

  @Column
  enemScore: number;

  @Column
  financing: string;

  @Column
  source: string;

  @Column
  channel: string;

  @Column
  utmSource: string;

  @Column
  utmMedium: string;

  @Column
  utmCampaign: string;

  @Default(0)
  @Column
  score: number;

  @Column
  lostReason: string;

  @Column(DataType.TEXT)
  lostNote: string;

  @Column
  wonAt: Date;

  @Column
  lostAt: Date;

  @Column
  firstContactAt: Date;

  @Column
  lastContactAt: Date;

  @Column
  lastInboundAt: Date;

  @Column
  nextFollowUpAt: Date;

  @Column
  consentAt: Date;

  @Column(DataType.TEXT)
  notes: string;

  @ForeignKey(() => Course)
  @Column
  courseId: number;

  @BelongsTo(() => Course)
  course: Course;

  @ForeignKey(() => LeadStage)
  @Column
  stageId: number;

  @BelongsTo(() => LeadStage)
  stage: LeadStage;

  @ForeignKey(() => User)
  @Column
  ownerId: number;

  @BelongsTo(() => User)
  owner: User;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @BelongsToMany(() => Tag, () => LeadTag)
  tags: Tag[];

  @HasMany(() => LeadActivity)
  activities: LeadActivity[];

  @HasMany(() => LeadTask)
  tasks: LeadTask[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Lead;
