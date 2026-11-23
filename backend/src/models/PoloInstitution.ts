import Model from "./BaseModel";
import { Table, Column, PrimaryKey, CreatedAt, UpdatedAt } from "sequelize-typescript";

// The universities a polo serves (a polo can serve more than one university of the group)
@Table({ tableName: "PoloInstitutions" })
export default class PoloInstitution extends Model<PoloInstitution> {
  @PrimaryKey @Column poloId: number;
  @PrimaryKey @Column institutionId: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
