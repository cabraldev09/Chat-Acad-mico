import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default
} from "sequelize-typescript";

@Table
class AiLearning extends Model<AiLearning> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  agentId: number;

  @Column
  ticketId: number;

  @Column
  contactName: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  question: string;

  @Column(DataType.TEXT)
  suggestedAnswer: string;

  // aguardando_equipe | para_revisar | aprovada | descartada
  @Default("aguardando_equipe")
  @Column
  status: string;

  // equipe | dono
  @Column
  answerSource: string;

  @Column
  documentId: number;

  @Column
  reviewedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiLearning;
