import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";

import Polo from "./Polo";
import User from "./User";

@Table
class PoloMember extends Model<PoloMember> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Polo)
  @Column
  poloId: number;

  @BelongsTo(() => Polo)
  polo: Polo;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  // comercial | tutoria | academico | coordenacao
  @Column
  role: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default PoloMember;
