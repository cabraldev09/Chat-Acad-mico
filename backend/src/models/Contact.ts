import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default,
  HasMany,
  BelongsToMany,
  DataType
} from "sequelize-typescript";
import ContactCustomField from "./ContactCustomField";
import Ticket from "./Ticket";
import Tag from "./Tag";
import ContactTag from "./ContactTag";

@Table
class Contact extends Model<Contact> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Unique
  @Column
  number: string;

  @Unique
  @Column
  lid: string;

  @AllowNull(false)
  @Default("")
  @Column
  email: string;

  @Column(DataType.TEXT)
  profilePicUrl: string;

  @Default(false)
  @Column
  isGroup: boolean;

  @Default("whatsapp")
  @Column
  channel: string;

  // asked to stop receiving mass messages
  @Default(false)
  @Column
  optOut: boolean;

  @Column
  optOutAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @HasMany(() => ContactCustomField)
  extraInfo: ContactCustomField[];

  @BelongsToMany(() => Tag, () => ContactTag)
  tags: Tag[];
}

export default Contact;
