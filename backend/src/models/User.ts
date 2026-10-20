import Model from "./BaseModel";
import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  DataType,
  BeforeCreate,
  BeforeUpdate,
  PrimaryKey,
  AutoIncrement,
  Default,
  HasMany,
  BelongsToMany,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import { hash, compare } from "bcryptjs";
import { PASSWORD_COST } from "../helpers/Passwords";
import Ticket from "./Ticket";
import Queue from "./Queue";
import UserQueue from "./UserQueue";
import Whatsapp from "./Whatsapp";

@Table
class User extends Model<User> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Column
  email: string;

  @Column(DataType.VIRTUAL)
  password: string;

  @Column
  passwordHash: string;

  @Default(0)
  @Column
  tokenVersion: number;

  // JSON with the person's own preferences (notification sound, ...)
  @Column(DataType.TEXT)
  preferences: string;

  @Default("user")
  @Column
  profile: string;

  // Efí account identifier that receives this person's enrollment fees
  @Column
  efiPayeeCode: string;

  // WhatsApp the affiliates registered by this person use to reach them (support)
  @Column
  phone: string;

  // comercial | academica: the side a coordinator coordinates
  @Column
  coordArea: string;

  // admin | coordenacao | consultor | tutor | academico
  @Default("consultor")
  @Column
  role: string;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => UserQueue)
  queues: Queue[];

  @BeforeUpdate
  @BeforeCreate
  static hashPassword = async (instance: User): Promise<void> => {
    if (instance.password) {
      instance.passwordHash = await hash(instance.password, PASSWORD_COST);
    }
  };

  public checkPassword = async (password: string): Promise<boolean> => {
    return compare(password, String(this.getDataValue("passwordHash") || ""));
  };
}

export default User;
