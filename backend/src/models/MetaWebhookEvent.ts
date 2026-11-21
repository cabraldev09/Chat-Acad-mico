import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

// Each webhook of the Meta is stored before the 200 goes back, and processed from here: a restart or an error in the middle no longer
// loses a message (the Meta does not send again what it saw answered). key = sha256 of the raw body, so a repeated delivery is one row.
@Table
export default class MetaWebhookEvent extends Model<MetaWebhookEvent> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column key: string;
  // the connection of the URL (/webhooks/meta/:id); null = the app webhook (Instagram by login), routed by account id
  @Column whatsappId: number;
  @Column(DataType.TEXT) body: string;
  // pending | processing | done | failed
  @Column status: string;
  @Column attempts: number;
  @Column nextAt: Date;
  @Column(DataType.TEXT) error: string;
  @Column processedAt: Date;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
