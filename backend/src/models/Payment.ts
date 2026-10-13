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
import Proposal from "./Proposal";

@Table
class Payment extends Model<Payment> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Default("efi")
  @Column
  provider: string;

  @Default("matricula")
  @Column
  kind: string;

  @AllowNull(false)
  @Column
  txid: string;

  @Column(DataType.DECIMAL(10, 2))
  amount: number;

  // pending | paid | cancelled | expired
  @Default("pending")
  @Column
  status: string;

  @Column
  description: string;

  @Column(DataType.TEXT)
  pixCopiaECola: string;

  @Column(DataType.TEXT({ length: "long" }))
  qrImage: string;

  @Column(DataType.TEXT)
  locationUrl: string;

  @Column
  expiresAt: Date;

  @Column
  paidAt: Date;

  @Column(DataType.DECIMAL(10, 2))
  paidAmount: number;

  @Column
  endToEndId: string;

  @Column(DataType.TEXT)
  lastError: string;

  @ForeignKey(() => Lead)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  @ForeignKey(() => Proposal)
  @Column
  proposalId: number;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Payment;
