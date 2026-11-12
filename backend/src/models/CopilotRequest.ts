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
  // "suggestion" (a reply) or "brief" (the summary of the client with the next step)
  @Column kind: string;
  // the variation asked: regenerar, mais_curta, mais_formal, mais_calorosa
  @Column mode: string;
  // titles of the knowledge base the answer used (JSON list)
  @Column sources: string;
  // the consultant's opinion: util / nao_util, and why
  @Column feedback: string;
  @Column feedbackReason: string;
  // what happened to the suggestion: taken (put in the message box), then used / edited / discarded when a message went out
  @Column outcome: string;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
