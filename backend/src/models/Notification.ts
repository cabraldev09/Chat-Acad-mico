import Model from "./BaseModel";
import { Table, Column, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt, Default } from "sequelize-typescript";

// One notice for one person (the bell's "Avisos"): kept until read, so nothing is lost while the person is away from the screen.
// dedupeKey makes the same notice never appear twice for the same person.
@Table
export default class Notification extends Model<Notification> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column userId: number;
  @Column kind: string;
  // info | warning | urgent
  @Default("info") @Column level: string;
  @Column title: string;
  @Column body: string;
  @Column link: string;
  @Column dedupeKey: string;
  @Column readAt: Date;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
