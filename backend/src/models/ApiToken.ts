import { parseUsage } from "../helpers/ApiUsage";
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

import { polosOf, scopesOf } from "../helpers/ApiTokens";

@Table
class ApiToken extends Model<ApiToken> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  // the plain token is no longer kept (only the tokens made before the hashes had it, erased by the migration)
  @Column
  token: string;

  // SHA-256 of the token: the only way to recognize it
  @Column
  tokenHash: string;

  // the first characters, to recognize it on the screen
  @Column
  tokenPrefix: string;

  // JSON array of scopes (helpers/ApiTokens); ["*"] = full access (legacy)
  @Column(DataType.TEXT)
  scopes: string;

  // JSON array of polo ids the token reads; null = every polo
  @Column(DataType.TEXT)
  poloIds: string;

  @Column
  expiresAt: Date;

  // made before scopes existed: full access kept, marked "antigo" on the screen
  @Default(false)
  @Column
  legacy: boolean;

  @Column
  createdById: number;

  @Column
  lastUsedAt: Date;

  // the routes it calls (helpers/ApiUsage): which integration depends on it, before replacing it
  @Column(DataType.TEXT)
  usage: string;

  // never the token nor its hash: the prefix, what it may do, the polos and the validity
  toJSON(): any {
    const data: any = super.toJSON();
    delete data.token;
    delete data.tokenHash;
    data.scopes = scopesOf(data.scopes);
    data.poloIds = polosOf(data.poloIds);
    data.expired = !!data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now();
    data.usage = parseUsage(data.usage);
    return data;
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ApiToken;
