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

import Campaign from "./Campaign";

@Table
class CampaignShipping extends Model<CampaignShipping> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @AllowNull(false)
  @Column
  number: string;

  @Column(DataType.TEXT)
  message: string;

  @Default("pending")
  @Column
  status: string;

  @Column(DataType.TEXT)
  error: string;

  @Column
  sentAt: Date;

  @ForeignKey(() => Campaign)
  @Column
  campaignId: number;

  @BelongsTo(() => Campaign)
  campaign: Campaign;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CampaignShipping;
