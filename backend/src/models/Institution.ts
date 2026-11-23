import { signedFileUrl } from "../helpers/SignedFile";
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
  BelongsTo
} from "sequelize-typescript";

@Table
class Institution extends Model<Institution> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  cnpj: string;

  @Column
  logoFile: string;

  @Default(true)
  @Column
  active: boolean;

  // the brand of the university: the short name of the texts, the address of its public pages (/f/<slug>), its color, site, the sender of
  // its e-mails and the footer of its pages and documents
  @Column
  shortName: string;

  @Column
  slug: string;

  @Column
  brandColor: string;

  @Column
  site: string;

  @Column
  mailFromName: string;

  @Column
  mailFrom: string;

  @Column
  footer: string;

  // the university of everything that does not say another one (one only)
  @Default(false)
  @Column
  isDefault: boolean;

  toJSON(): any {
    const data = super.toJSON() as any;
    return { ...data, logoUrl: data.logoFile ? signedFileUrl(data.logoFile) : null };
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Institution;
