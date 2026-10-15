import Model from "./BaseModel";
import { Table, Column, DataType, CreatedAt, UpdatedAt, PrimaryKey, AutoIncrement, AllowNull, Default, HasMany
} from "sequelize-typescript";
import GoalMember from "./GoalMember";

@Table
class Goal extends Model<Goal> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  title: string;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  startsOn: string;

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  endsOn: string;

  // active | archived
  @Default("active")
  @Column
  status: string;

  // working days that count in the countdown: 5 = Mon-Fri, 6 = Mon-Sat, 7 = every day
  @Default(5)
  @Column
  workDays: number;

  // team = monthly goals of the consultants · polo = semester goals of the polos
  @Default("team")
  @Column
  kind: string;

  @Column
  createdBy: number;

  @HasMany(() => GoalMember)
  members: GoalMember[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Goal;
