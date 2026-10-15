import { Model } from "sequelize-typescript";

// Legacy models describe nullable columns as ordinary TS properties. Query and
// creation attributes exclude ORM methods and accept the database's null values.
export type Attributes<T> = { [K in Exclude<keyof T, Exclude<keyof Model, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">>]: T[K] | null };
export default class BaseModel<T extends {}> extends Model<Attributes<T>, Partial<Attributes<T>>> {}
