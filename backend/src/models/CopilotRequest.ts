import Model from "./BaseModel";
import { Table, Column, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";
@Table
export default class CopilotRequest extends Model<CopilotRequest> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column userId: number;
  @Column whatsappId: number;
  @Column ticketId: number;
  @Column contextKey: string;
  @Column configVersion: number;
  @Column status: string;
  @Column text: string;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
