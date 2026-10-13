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

import Lead from "./Lead";
import Tag from "./Tag";

@Table
class LeadTag extends Model<LeadTag> {
  @ForeignKey(() => Lead)
  @PrimaryKey
  @Column
  leadId: number;

  @ForeignKey(() => Tag)
  @PrimaryKey
  @Column
  tagId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadTag;
