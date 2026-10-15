import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  Unique,
  BelongsToMany,
  ForeignKey,
  BelongsTo,
  BeforeUpdate,
  BeforeCreate
} from "sequelize-typescript";
import Queue from "./Queue";
import User from "./User";
import Ticket from "./Ticket";
import WhatsappQueue from "./WhatsappQueue";
import { maskConfig } from "../helpers/Secrets";

@Table
class Whatsapp extends Model<Whatsapp> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull
  @Unique
  @Column(DataType.TEXT)
  name: string;

  @Column(DataType.TEXT)
  session: string;

  @Column(DataType.TEXT)
  qrcode: string;

  @Column
  status: string;

  // since when the connection is in this state (set by the hook below)
  @Column(DataType.DATE)
  statusSince: Date;

  @BeforeCreate
  static startState(instance: Whatsapp): void {
    instance.statusSince = new Date();
  }

  @BeforeUpdate
  static trackState(instance: Whatsapp): void {
    if (instance.changed("status")) instance.statusSince = new Date();
  }

  @Column
  battery: string;

  @Column
  plugged: boolean;

  @Column
  retries: number;

  @Column(DataType.TEXT)
  greetingMessage: string;

  @Column(DataType.TEXT)
  farewellMessage: string;

  @Default(false)
  @AllowNull
  @Column
  isDefault: boolean;

  @Default("whatsapp")
  @Column
  channel: string;

  @Column(DataType.TEXT)
  config: string;

  @Column(DataType.TEXT)
  businessHours: string;

  @Column(DataType.TEXT)
  outOfHoursMessage: string;

  // "strict" | "relaxed": how hard the sending guard limits an unofficial connection
  @Default("strict")
  @Column
  riskMode: string;

  @Column
  connectedSince: Date;

  // who connected this number: its conversations go to that person (null = shared, managed by the administrator)
  @ForeignKey(() => User)
  @Column
  ownerId: number;

  @Column
  historyImportedAt: Date;

  @BelongsTo(() => User, "ownerId")
  owner: User;

  // off | selected | all: which WhatsApp groups become conversations (new numbers bring all of them, like the app)
  @Default("all")
  @Column
  groupsMode: string;

  @Column(DataType.TEXT)
  allowedGroups: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => WhatsappQueue)
  queues: Array<Queue & { WhatsappQueue: WhatsappQueue }>;

  @HasMany(() => WhatsappQueue)
  whatsappQueues: WhatsappQueue[];

  // never leak channel credentials to the browser
  toJSON(): any {
    const data: any = super.toJSON();
    data.config = maskConfig(data.config);
    return data;
  }
}

export default Whatsapp;
