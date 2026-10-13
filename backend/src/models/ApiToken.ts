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
class ApiToken extends Model<ApiToken> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  token: string;

  @Column
  lastUsedAt: Date;

  toJSON(): any {
    const data: any = super.toJSON();
    data.token = maskSecret(data.token);
    return data;
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ApiToken;
