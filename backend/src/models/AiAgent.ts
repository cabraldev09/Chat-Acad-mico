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

import { maskSecret } from "../helpers/Secrets";

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

  @Column(DataType.TEXT)
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

  @Column
  queueId: number;

  @Column
  whatsappId: number;

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
