import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, AllowNull, Default } from "sequelize-typescript";

@Table
class ChatFlow extends Model<ChatFlow> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Column
  description: string;

  // null = every connection
  @Column
  whatsappId: number;

  // draft | published
  @Default("draft")
  @Column
  status: string;

  // how a conversation enters the flow: {"type":"first_message"|"keyword"|"any"|"manual","keywords":[]}
  @Default('{"type":"first_message"}')
  @Column(DataType.TEXT)
  entry: string;

  // the graph being edited, and the copy people are talking to (set when published)
  @Default('{"nodes":[],"edges":[]}')
  @Column(DataType.TEXT)
  draft: string;

  @Column(DataType.TEXT)
  published: string;

  @Default(0)
  @Column
  version: number;

  @Column(DataType.DATE)
  publishedAt: Date;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ChatFlow;
