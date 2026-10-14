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
import Polo from "./Polo";
import Tag from "./Tag";
import LeadTag from "./LeadTag";
import LeadActivity from "./LeadActivity";
import LeadTask from "./LeadTask";
import Payment from "./Payment";
import { maskCpf } from "../helpers/Cpf";

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

  // digits only; never serialised (see toJSON), the detail endpoint adds it back
  @Column
  cpf: string;

  // Vestibular, ENEM, Transferência...
  @Column
  admissionType: string;

  // semester of the course the candidate enters (transfers start later)
  @Default(1)
  @Column
  entrySemester: number;

  // extra semesters beyond the curriculum (adaptations / dependencies)
  @Default(0)
  @Column
  extraSemesters: number;

  // how soon the candidate wants to enrol
  @Column
  decisionTimeline: string;

  // why they want the course
  @Column
  motivation: string;

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

  // none | pending | started | done (tutor onboarding after enrollment)
  @Default("none")
  @Column
  onboardingStatus: string;

  @Column
  onboardingTutorId: number;

  @Column
  enrolledAt: Date;

  @Column
  onboardingStartedAt: Date;

  @Column
  onboardingDoneAt: Date;

  @Column
  onboardingAlertAt: Date;

  @Column
  indicatedBy: number;

  @Column
  slaAlertedAt: Date;

  // comes from a conversation that existed before the number was connected: kept, but never counted
  @Default(false)
  @Column
  isHistorical: boolean;

  @ForeignKey(() => Polo)
  @Column
  poloId: number;

  @BelongsTo(() => Polo)
  polo: Polo;

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

  @HasMany(() => Payment)
  payments: Payment[];

  toJSON(): any {
    const data: any = super.toJSON();
    data.hasCpf = !!data.cpf;
    data.cpfMasked = maskCpf(data.cpf);
    delete data.cpf;
    return data;
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Lead;
