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

import ContactList from "./ContactList";
import Whatsapp from "./Whatsapp";
import CampaignShipping from "./CampaignShipping";

@Table
class Campaign extends Model<Campaign> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Default("draft")
  @Column
  status: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  message: string;

  @Column
  mediaUrl: string;

  @Column
  scheduledAt: Date;

  @Column
  startedAt: Date;

  @Column
  finishedAt: Date;

  @Default(20)
  @Column
  intervalMin: number;

  @Default(60)
  @Column
  intervalMax: number;

  @Default(20)
  @Column
  batchSize: number;

  @Default(300)
  @Column
  batchPause: number;

  @ForeignKey(() => ContactList)
  @Column
  contactListId: number;

  @BelongsTo(() => ContactList)
  contactList: ContactList;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @HasMany(() => CampaignShipping)
  shippings: CampaignShipping[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Campaign;
