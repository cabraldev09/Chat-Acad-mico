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
  BelongsToMany
} from "sequelize-typescript";

import Institution from "./Institution";
import ProposalTemplateInstitution from "./ProposalTemplateInstitution";

@Table
class ProposalTemplate extends Model<ProposalTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @ForeignKey(() => Institution)
  @Column
  institutionId: number;

  @BelongsTo(() => Institution)
  institution: Institution;

  @Column(DataType.DECIMAL(10, 2))
  enrollmentFee: number;

  @Column
  dueDay: number;

  @Column
  installments: number;

  @Column
  punctualityPct: number;

  @Column
  lateFee1Pct: number;

  @Column
  lateFee2Pct: number;

  @Column(DataType.DECIMAL(5, 2))
  annualMin: number;

  @Column(DataType.DECIMAL(5, 2))
  annualMax: number;

  // JSON: [{ "from": 2, "pct": 2 }, { "from": 6, "pct": 3 }]
  @AllowNull(false)
  @Column(DataType.TEXT)
  semestralSchedule: string;

  @Column(DataType.DECIMAL(5, 2))
  bolsaFirst: number;

  @Column(DataType.DECIMAL(5, 2))
  bolsaNext: number;

  @Column(DataType.TEXT)
  bolsaNote: string;

  @Column(DataType.TEXT)
  observation: string;

  @Column(DataType.TEXT)
  disclaimer: string;

  @Column(DataType.TEXT)
  finalMessage: string;

  @Default(false)
  @Column
  isDefault: boolean;

  // number of installments when fixed; null = until the end of the course
  @Column
  installmentsFixed: number;

  // the discount drops after the first semester (bolsaFirst -> bolsaNext)
  @Default(true)
  @Column
  hasRegression: boolean;

  // semester and yearly adjustments apply
  @Default(true)
  @Column
  hasAdjustment: boolean;

  // same monthly fee until the end of the course
  @Default(false)
  @Column
  fixedUntilEnd: boolean;

  // first monthly fee is waived (the second one carries the first due date)
  @Default(false)
  @Column
  firstExempt: boolean;

  // an inactive model is not offered in new proposals (the ones already made keep their numbers)
  @Default(true)
  @Column
  active: boolean;

  // "semestral": the graduation (semester projection with adjustments); "parcelado": a fixed number of installments of a fixed value
  @Default("semestral")
  @Column
  planType: string;

  // the installments by the course's duration, as JSON [{ months, installments }] ("6 months = 12 installments")
  @Column(DataType.TEXT)
  installmentsByDuration: string;

  // the certification fee, paid when the course is concluded (the consultant charges it, waives it or changes it)
  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  certificationFee: number;

  @Default(false)
  @Column
  chargeCertification: boolean;

  // the ways of paying a course paid at once: the Pix discount and the card (installments, monthly rate, whether the interest is passed on)
  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  pixDiscountPct: number;

  @Default(12)
  @Column
  cardMaxInstallments: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  cardRatePct: number;

  @Default(true)
  @Column
  cardPassInterest: boolean;

  // the course levels this model is for (JSON list); empty = any level
  @Column(DataType.TEXT)
  courseLevels: string;

  @Column(DataType.TEXT)
  waIntro: string;

  @Column(DataType.TEXT)
  waClosing: string;

  @BelongsToMany(() => Institution, () => ProposalTemplateInstitution)
  institutions: Institution[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ProposalTemplate;
