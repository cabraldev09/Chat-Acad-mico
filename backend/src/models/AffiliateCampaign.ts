import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, Default, AllowNull, ForeignKey, BelongsTo
} from "sequelize-typescript";
import User from "./User";

// A campaign the institution runs (or the admin releases) for affiliates: shown in their portal while it is valid
@Table
class AffiliateCampaign extends Model<AffiliateCampaign> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  @Column(DataType.TEXT)
  description: string;

  @Column
  coverFile: string;

  @Column
  startsAt: Date;

  @Column
  endsAt: Date;

  // all | owners (consultants listed in AffiliateAudiences) | affiliates (specific people)
  @Default("all")
  @Column
  audience: string;

  // bonus paid per enrolment while the campaign runs (replaces the general value)
  @Column(DataType.DECIMAL(10, 2))
  bonusValue: number;

  @Default(true)
  @Column
  active: boolean;

  @ForeignKey(() => User)
  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateCampaign;
