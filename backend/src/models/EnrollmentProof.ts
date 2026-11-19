import Model from "./BaseModel";
import { Table, Column, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

// the print of the enrollment attached when the consultant confirms it (see CommercialServices/EnrollmentProof)
@Table({ tableName: "EnrollmentProofs" })
export default class EnrollmentProof extends Model<EnrollmentProof> {
  @PrimaryKey @AutoIncrement @Column id: number;
  @Column leadId: number;
  @Column enrollmentId: number; // the extra course (LeadEnrollments); null = the first enrollment of the lead
  @Column attachedAt: Date; // set when the enrollment is confirmed with it
  @Column fileName: string;
  @Column originalName: string;
  @Column mime: string;
  @Column size: number;
  @Column rgmRead: string;
  @Column nameRead: string;
  @Column courseRead: string;
  @Column(DataType.TEXT) readNote: string;
  @Column uploadedById: number;
  @CreatedAt createdAt: Date;
  @UpdatedAt updatedAt: Date;
}
