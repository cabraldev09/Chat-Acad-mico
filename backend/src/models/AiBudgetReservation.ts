import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";
@Table
export default class AiBudgetReservation extends Model<AiBudgetReservation> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column agentId: number;
  @Column tokens: number;
  @Column(DataType.DECIMAL(14, 8)) estimatedUsd: number;
  @Column expiresAt: Date;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
