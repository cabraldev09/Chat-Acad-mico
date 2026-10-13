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

import Institution from "./Institution";

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

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ProposalTemplate;
