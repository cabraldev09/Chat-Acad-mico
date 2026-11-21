import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

// One conversation of a consultant, read once a day by the AI (workers/ConsultantReview): the objections the lead raised and whether
// the consultant answered them, the steps of the sales process where the consultant had difficulty and the ones skipped. No names,
// phones or message text are kept here: only the codes and a short note.
@Table
export default class ConsultantReview extends Model<ConsultantReview> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column userId: number;
  @Column ticketId: number;
  @Column leadId: number;
  // YYYY-MM-DD in the company timezone
  @Column day: string;
  // [{ type: "preco" | "tempo" | …, handled: boolean }]
  @Column(DataType.JSONB) objections: Array<{ type: string; handled: boolean }>;
  // keys of the sales process (configOf().steps)
  @Column(DataType.JSONB) difficulties: string[];
  @Column(DataType.JSONB) skipped: string[];
  @Column note: string;
  @Column model: string;
  @Column tokens: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
