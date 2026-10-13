import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  BelongsToMany,
  HasMany
} from "sequelize-typescript";

@Table
class ChatbotNode extends Model<ChatbotNode> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  whatsappId: number;

  @Column
  parentId: number;

  @Default(0)
  @Column
  position: number;

  @AllowNull(false)
  @Column
  title: string;

  @Column(DataType.TEXT)
  keywords: string;

  @Column(DataType.TEXT)
  message: string;

  @Default("menu")
  @Column
  action: string;

  @Column
  targetId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ChatbotNode;
