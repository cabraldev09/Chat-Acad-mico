import Model from "./BaseModel";
import { Table, Column, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt, Default } from "sequelize-typescript";

// A warning or recommendation the OpenBot wrote for the management (services/InsightServices/OpenbotInsights). No personal data; the
// administrators only see it. dedupeKey is unique among the ones not dismissed.
@Table
export default class OpenbotInsight extends Model<OpenbotInsight> {
  @PrimaryKey @AutoIncrement @Column id: number;
  // the API token that wrote it (null for the old tokens of full access)
  @Column tokenId: number;
  // indicador | oportunidade | risco | operacao
  @Column kind: string;
  // info | warning | urgent
  @Default("info") @Column level: string;
  @Column title: string;
  @Column body: string;
  @Column link: string;
  @Column dedupeKey: string;
  @Default("OpenBot") @Column source: string;
  @Column expiresAt: Date;
  @Column resolvedAt: Date;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
