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
  HasMany
} from "sequelize-typescript";

import { maskSecret, openSecret, sealSecret } from "../helpers/Secrets";

@Table
class AiAgent extends Model<AiAgent> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Default("anthropic")
  @Column
  provider: string;

  @AllowNull(false)
  @Column
  model: string;

  // stored sealed (see helpers/SecretSettings); the code always reads and writes the plain key
  @Column({
    type: DataType.TEXT,
    get(this: any) {
      return openSecret(this.getDataValue("apiKey"));
    },
    set(this: any, value: string) {
      this.setDataValue("apiKey", value ? (String(value).startsWith("enc:v1:") ? value : sealSecret(String(value))) : value);
    }
  })
  apiKey: string;

  @Column(DataType.TEXT)
  systemPrompt: string;

  @Column(DataType.TEXT({ length: "long" }))
  knowledgeBase: string;

  @Column(DataType.TEXT)
  handoffMessage: string;

  @Default(12)
  @Column
  maxHistory: number;

  @Default(true)
  @Column
  active: boolean;

  // tone, rules and prohibitions: { tone, rules, forbidden, greeting }
  @Column(DataType.JSON)
  persona: any;

  @Default(350)
  @Column
  maxTokens: number;

  // 0 = no daily limit
  @Default(300000)
  @Column
  dailyTokenCap: number;

  @Default(14)
  @Column
  handoffAfterTurns: number;

  // seconds to wait for the person to finish writing before answering once
  @Default(4)
  @Column
  waitSeconds: number;

  // flows the agent may start by itself: [{ name, description, flowId }]
  @Column(DataType.JSON)
  functions: any;

  // what the agent must find out before handing over: [{ key, label, required }]
  @Column(DataType.JSON)
  slots: any;

  // WhatsApp of the person who reviews what the agent learns, and the connection used to tell them
  @Column
  reviewNumber: string;

  @Column
  reviewWhatsappId: number;

  // learn from what the team answers after the agent hands a question over
  @Default(true)
  @Column
  learnFromTeam: boolean;

  @Column
  queueId: number;

  @Column
  whatsappId: number;

  // the connections the agent answers on (a list: the same agent on the QR number and on the Cloud API number); empty means all of them
  @Column(DataType.JSON)
  whatsappIds: number[] | null;

  toJSON(): any {
    const data: any = super.toJSON();
    data.apiKey = maskSecret(data.apiKey);
    return data;
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiAgent;
