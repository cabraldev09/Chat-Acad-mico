import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";
@Table
export default class OutboundDelivery extends Model<OutboundDelivery> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column key: string;
  @Column ticketId: number;
  @Column contactId: number;
  @Column whatsappId: number;
  @Column channel: string;
  @Column status: string;
  @Column externalId: string;
  @Column(DataType.TEXT) error: string;
  @Column(DataType.DECIMAL(14, 8)) estimatedUsd: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
