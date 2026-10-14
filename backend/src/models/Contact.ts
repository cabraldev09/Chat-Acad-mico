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
import { publicPicUrl } from "../helpers/PicUrl";
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

  // WhatsApp's own picture links expire, so pictures are saved on our side and stored as a relative path;
  // anything that starts with http (not saved yet) is returned untouched
  @Column(DataType.TEXT)
  get profilePicUrl(): string | null {
    return publicPicUrl(this.getDataValue("profilePicUrl"));
  }

  set profilePicUrl(value: string | null) {
    this.setDataValue("profilePicUrl", value);
  }

  @Column
  picCheckedAt: Date;

  @Default(false)
  @Column
  isGroup: boolean;

  @Default("whatsapp")
  @Column
  channel: string;

  // belongs to the team (with or without a login): never counted in statistics or the CRM funnel
  @Default(false)
  @Column
  isStaff: boolean;

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
