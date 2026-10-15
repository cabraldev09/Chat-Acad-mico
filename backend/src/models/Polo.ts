import Model from "./BaseModel";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  HasMany
} from "sequelize-typescript";

import PoloMember from "./PoloMember";
import Queue from "./Queue";

@Table
class Polo extends Model<Polo> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  code: string;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  city: string;

  @Column
  state: string;

  @Default(true)
  @Column
  active: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => PoloMember)
  members: PoloMember[];

  @HasMany(() => Queue)
  queues: Queue[];
}

export default Polo;
