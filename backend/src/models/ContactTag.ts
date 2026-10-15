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

import Contact from "./Contact";
import Tag from "./Tag";

@Table
class ContactTag extends Model<ContactTag> {
  @ForeignKey(() => Contact)
  @PrimaryKey
  @Column
  contactId: number;

  @ForeignKey(() => Tag)
  @PrimaryKey
  @Column
  tagId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContactTag;
