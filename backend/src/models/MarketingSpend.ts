import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

// money spent to attract students (see the migration)
@Table
class MarketingSpend extends Model<MarketingSpend> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  // YYYY-MM
  @AllowNull(false)
  @Column
  month: string;

  @AllowNull(false)
  @Column
  source: string;

  @Column
  campaign: string;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 2))
  amount: number;

  @Column(DataType.TEXT)
  note: string;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default MarketingSpend;
