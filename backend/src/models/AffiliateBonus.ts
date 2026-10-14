import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, Default, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";
import Affiliate from "./Affiliate";
import Lead from "./Lead";

// One line per enrolment: what the maintainer owes the affiliate and whether it was paid
@Table({ tableName: "AffiliateBonuses" })
class AffiliateBonus extends Model<AffiliateBonus> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Affiliate)
  @AllowNull(false)
  @Column
  affiliateId: number;

  @BelongsTo(() => Affiliate)
  affiliate: Affiliate;

  @ForeignKey(() => Lead)
  @AllowNull(false)
  @Column
  leadId: number;

  @BelongsTo(() => Lead)
  lead: Lead;

  @Column
  campaignId: number;

  // bonus | pix (how the maintainer will pay)
  @Default("bonus")
  @Column
  kind: string;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  amount: number;

  // pending | approved | paid | cancelled
  @Default("pending")
  @Column
  status: string;

  @Column
  reason: string;

  @Column
  approvedBy: number;

  @Column
  approvedAt: Date;

  @Column
  paidBy: number;

  @Column
  paidAt: Date;

  @Column
  paymentRef: string;

  @Column(DataType.TEXT)
  note: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateBonus;
