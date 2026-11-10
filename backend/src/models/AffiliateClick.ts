import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// one open of the referral link of an affiliate
@Table
class AffiliateClick extends Model<AffiliateClick> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  affiliateId: number;

  // sha256 of address + browser + day: counts a person once a day without keeping who they are
  @AllowNull(false)
  @Column
  visitor: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateClick;
