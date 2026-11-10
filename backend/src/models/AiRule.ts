import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

// A lesson of the owner: kind regra (an order), exemplo (a good answer to a question) or estilo (the way of speaking)
@Table
class AiRule extends Model<AiRule> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  agentId: number;

  @Default("regra")
  @Column
  kind: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  text: string;

  @Default(0)
  @Column
  position: number;

  @Default(true)
  @Column
  active: boolean;

  @Default("treino")
  @Column
  source: string;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiRule;
