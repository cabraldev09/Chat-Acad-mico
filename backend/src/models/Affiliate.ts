import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, Default, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";
import User from "./User";
import Polo from "./Polo";

// Someone outside the team who refers students (see the migration for the whole picture)
@Table
class Affiliate extends Model<Affiliate> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  phone: string;

  @Column
  email: string;

  @Column
  document: string;

  @Column
  city: string;

  // the consultant who follows this affiliate
  @ForeignKey(() => User)
  @Column
  ownerId: number;

  @BelongsTo(() => User)
  owner: User;

  @ForeignKey(() => Polo)
  @Column
  poloId: number;

  @AllowNull(false)
  @Column
  refCode: string;

  // grants access to the public portal; regenerating it cuts the old link
  @AllowNull(false)
  @Column
  portalToken: string;

  // the affiliate's own link in the "Minhas indicações" app, saved by the consultant
  @Column(DataType.TEXT)
  externalLink: string;

  @Column
  pixKeyType: string;

  @Column
  pixKey: string;

  // active | paused
  @Default("active")
  @Column
  status: string;

  @Column(DataType.TEXT)
  notes: string;

  // overrides the general bonus for this affiliate
  @Column(DataType.DECIMAL(10, 2))
  bonusValue: number;

  @Column
  lastAccessAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Affiliate;
