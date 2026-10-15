import Model from "./BaseModel";
import { Table, Column, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, ForeignKey
} from "sequelize-typescript";
import ProposalTemplate from "./ProposalTemplate";
import Institution from "./Institution";

@Table
class ProposalTemplateInstitution extends Model<ProposalTemplateInstitution> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => ProposalTemplate)
  @Column
  templateId: number;

  @ForeignKey(() => Institution)
  @Column
  institutionId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ProposalTemplateInstitution;
