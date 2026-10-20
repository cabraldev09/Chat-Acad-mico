import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";

import Polo from "./Polo";

// A city a polo serves (the lead who lives there is handled by that polo's commercial team). `cityKey` is the name without accents or
// punctuation, so "Ji-Paraná" and "ji parana" are the same city.
@Table
class PoloCoverage extends Model<PoloCoverage> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Polo)
  @AllowNull(false)
  @Column
  poloId: number;

  @BelongsTo(() => Polo)
  polo: Polo;

  @AllowNull(false)
  @Column
  city: string;

  @AllowNull(false)
  @Column
  cityKey: string;

  @Column
  state: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default PoloCoverage;
