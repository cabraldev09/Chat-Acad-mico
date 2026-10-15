import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

@Table
class ChatFlowRun extends Model<ChatFlowRun> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  flowId: number;

  @Column
  ticketId: number;

  @Column
  contactId: number;

  @Default(1)
  @Column
  version: number;

  // the block waiting for the person's answer
  @Column
  nodeId: string;

  // waiting | delayed | done | handoff
  @Default("waiting")
  @Column
  status: string;

  @AllowNull(false)
  @Default("{}")
  @Column(DataType.TEXT)
  vars: string;

  @Default(0)
  @Column
  tries: number;

  @Column(DataType.DATE)
  resumeAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ChatFlowRun;
