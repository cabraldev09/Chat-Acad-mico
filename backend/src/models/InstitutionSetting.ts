import Model from "./BaseModel";
import { Table, Column, PrimaryKey, DataType, CreatedAt, UpdatedAt } from "sequelize-typescript";

// A setting that one university has differently (its form, its tutoring number, its NPS question...): read first, the global one otherwise
@Table({ tableName: "InstitutionSettings" })
export default class InstitutionSetting extends Model<InstitutionSetting> {
  @PrimaryKey @Column institutionId: number;
  @PrimaryKey @Column key: string;
  @Column(DataType.TEXT) value: string;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
