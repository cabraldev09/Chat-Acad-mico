import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, Unique } from "sequelize-typescript";

// A national norm (decree, MEC ordinance) the agents rely on, with where it was read, its status and when someone last checked it against the
// official source. The agents are told the status, so an amended norm is not quoted as if it were current.
@Table
class RegulatoryNorm extends Model<RegulatoryNorm> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Unique
  @AllowNull(false)
  @Column
  key: string;

  @AllowNull(false)
  @Column
  title: string;

  @AllowNull(false)
  @Column
  number: string;

  // decreto | portaria | outro
  @AllowNull(false)
  @Column
  kind: string;

  @Column(DataType.DATEONLY)
  publishedAt: string;

  @Column
  sourceUrl: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  summary: string;

  // vigente | alterada | revogada
  @Default("vigente")
  @Column
  status: string;

  @Column(DataType.TEXT)
  amendments: string;

  @Column
  reviewedAt: Date;

  @Column
  reviewedBy: number;

  @Default(true)
  @Column
  fromSystem: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default RegulatoryNorm;
