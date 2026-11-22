import Model from "./BaseModel";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  AfterSave,
  AfterDestroy,
  AfterUpsert,
  AfterBulkCreate,
  AfterBulkUpdate,
  AfterBulkDestroy
} from "sequelize-typescript";
import { forgetSettings } from "../helpers/SettingsCache";

@Table
class Setting extends Model<Setting> {
  @PrimaryKey
  @Column
  key: string;

  @Column
  value: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // any change clears the settings kept in memory (helpers/SettingsCache)
  @AfterSave
  @AfterDestroy
  @AfterUpsert
  @AfterBulkCreate
  @AfterBulkUpdate
  @AfterBulkDestroy
  static clearCache(_instance: any, options?: any): void {
    forgetSettings(options && options.transaction ? options : _instance);
  }
}

export default Setting;
