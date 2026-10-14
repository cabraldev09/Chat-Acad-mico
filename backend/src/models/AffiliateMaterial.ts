import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, Default, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";
import Course from "./Course";
import AffiliateCampaign from "./AffiliateCampaign";

// Support material: banner, copy, video, course information, list of courses. Never carries prices.
@Table
class AffiliateMaterial extends Model<AffiliateMaterial> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  // banner | copy | video | course_info | course_list | campaign | other
  @Default("other")
  @Column
  kind: string;

  @Column(DataType.TEXT)
  description: string;

  @Column
  fileName: string;

  @Column
  originalName: string;

  @Column
  mimeType: string;

  @Column
  fileSize: number;

  @Column(DataType.TEXT)
  externalUrl: string;

  @Column(DataType.TEXT)
  copyText: string;

  @ForeignKey(() => Course)
  @Column
  courseId: number;

  @BelongsTo(() => Course)
  course: Course;

  @ForeignKey(() => AffiliateCampaign)
  @Column
  campaignId: number;

  @Default("all")
  @Column
  audience: string;

  @Default(true)
  @Column
  active: boolean;

  @Default(0)
  @Column
  sortOrder: number;

  @Default(0)
  @Column
  downloads: number;

  @Column
  createdBy: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateMaterial;
