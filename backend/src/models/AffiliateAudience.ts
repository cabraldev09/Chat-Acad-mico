import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, Default, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";

@Table
class AffiliateAudience extends Model<AffiliateAudience> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  // material | campaign
  @AllowNull(false)
  @Column
  targetType: string;

  @AllowNull(false)
  @Column
  targetId: number;

  // a consultant (all their affiliates) ...
  @Column
  ownerId: number;

  // ... or one specific affiliate
  @Column
  affiliateId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateAudience;
