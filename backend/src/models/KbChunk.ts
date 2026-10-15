import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, ForeignKey, BelongsTo
} from "sequelize-typescript";

import KbDocument from "./KbDocument";

@Table
class KbChunk extends Model<KbChunk> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => KbDocument)
  @AllowNull(false)
  @Column
  documentId: number;

  @BelongsTo(() => KbDocument)
  document: KbDocument;

  @Default(0)
  @Column
  position: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  content: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  contentNorm: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default KbChunk;
