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

import { maskSecret } from "../helpers/Secrets";

@Table
class Webhook extends Model<Webhook> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  url: string;

  @Column
  secret: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  events: string;

  @Default(true)
  @Column
  active: boolean;

  @Column
  lastStatus: number;

  @Column(DataType.TEXT)
  lastError: string;

  @Column
  lastAt: Date;

  toJSON(): any {
    const data: any = super.toJSON();
    data.secret = maskSecret(data.secret);
    return data;
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Webhook;
