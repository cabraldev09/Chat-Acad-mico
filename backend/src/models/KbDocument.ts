import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, HasMany
} from "sequelize-typescript";

import AiAgent from "./AiAgent";
import KbChunk from "./KbChunk";

@Table
class KbDocument extends Model<KbDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  // doc | faq
  @Default("doc")
  @Column
  kind: string;

  // texto | arquivo | url
  @Default("texto")
  @Column
  source: string;

  @Column(DataType.TEXT)
  keywords: string;

  @AllowNull(false)
  @Column(DataType.TEXT({ length: "long" }))
  content: string;

  @ForeignKey(() => AiAgent)
  @Column
  agentId: number;

  @HasMany(() => KbChunk, { onDelete: "CASCADE", hooks: true })
  chunks: KbChunk[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default KbDocument;
