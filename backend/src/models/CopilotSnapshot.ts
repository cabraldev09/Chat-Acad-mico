import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, CreatedAt, UpdatedAt } from "sequelize-typescript";
@Table({ tableName: "CopilotSnapshots" })
export default class CopilotSnapshot extends Model<CopilotSnapshot> {
  @PrimaryKey @Column ticketId: number;
  @Column leadId: number;
  @Column userId: number;
  @Column(DataType.JSONB) doneKeys: string[];
  @Column current: string;
  @Column doneCount: number;
  @Column requiredTotal: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
