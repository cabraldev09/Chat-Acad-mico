import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

@Table
export default class WebhookDelivery extends Model<WebhookDelivery> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column webhookId: number;
  @Column(DataType.TEXT) payload: string;
  @Column status: string;
  @Column attempts: number;
  @Column nextAttemptAt: Date;
  @Column claimedAt: Date;
  @Column(DataType.TEXT) lastError: string;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
