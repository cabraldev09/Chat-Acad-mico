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
  BelongsToMany,
  HasMany,
  BeforeCreate
} from "sequelize-typescript";

import ContactList from "./ContactList";
import Whatsapp from "./Whatsapp";
import CampaignShipping from "./CampaignShipping";

@Table
class Campaign extends Model<Campaign> {
  @BeforeCreate
  static async setInstitution(campaign: Campaign): Promise<void> {
    if (campaign.institutionId) return;
    const { institutionIdForWhatsapp, defaultInstitution } = await import("../helpers/Institution");
    campaign.institutionId = campaign.whatsappId
      ? (await institutionIdForWhatsapp(campaign.whatsappId)) as number
      : ((await defaultInstitution())?.id as number);
  }

  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  // what the send is for (asked when the campaign is created; old campaigns have none)
  @Column(DataType.TEXT)
  objective: string;

  // the bot of the campaign: who answers goes into this flow (null: the usual answer of the number)
  @Column
  flowId: number;

  // the university of the group this belongs to (see models/Institution)
  @Column
  institutionId: number;

  @Default("draft")
  @Column
  status: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  message: string;

  @Column
  mediaUrl: string;

  // up to 5 messages sent in sequence to each recipient (see helpers/CampaignText)
  @Column(DataType.JSON)
  steps: any;

  // who created it (the tutor sees only their own)
  @Column
  createdById: number;

  @Column
  nextRunAt: Date;

  @Default(0)
  @Column
  sentInBatch: number;

  @Column
  scheduledAt: Date;

  @Column
  startedAt: Date;

  @Column
  finishedAt: Date;

  @Column
  pauseReason: string;

  @Column
  templateName: string;

  @Column
  templateLanguage: string;

  // JSON list: the variable that fills each {{n}} of the template (primeiro_nome, nome, curso, polo, consultor, numero)
  @Column(DataType.TEXT)
  templateParams: string;

  // the template's text, for the conversation history
  @Column(DataType.TEXT)
  templateBody: string;

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
