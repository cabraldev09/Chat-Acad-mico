import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, CreatedAt, UpdatedAt } from "sequelize-typescript";
@Table({ tableName: "CopilotProgress" })
export default class CopilotProgress extends Model<CopilotProgress> {
  @PrimaryKey @Column ticketId: number;
  @Column(DataType.JSONB) overrides: Record<string, boolean>;
  @Column updatedBy: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
