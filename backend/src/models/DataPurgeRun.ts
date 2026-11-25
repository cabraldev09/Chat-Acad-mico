import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

// One run of the retention of the content of the conversations (services/SystemServices/ContentRetention), or one simulation of it:
// how many audio files and conversation messages went (or would go), and when. Only numbers and names of polos, never message content.
@Table({ tableName: "DataPurgeRuns" })
export default class DataPurgeRun extends Model<DataPurgeRun> {
  @PrimaryKey @AutoIncrement @Column id: number;
  // run | simulation
  @Column mode: string;
  @Column audioDays: number;
  @Column conversationDays: number;
  @Column audioFiles: number;
  @Column conversations: number;
  @Column conversationMessages: number;
  @Column filesDeleted: number;
  @Column(DataType.TEXT) details: string;
  @Column(DataType.TEXT) error: string;
  @Column actorId: number;
  @Column startedAt: Date;
  @Column finishedAt: Date;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
