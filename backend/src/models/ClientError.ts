import { Table, Column, DataType, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement, AllowNull } from "sequelize-typescript";

@Table
class ClientError extends Model<ClientError> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  code: string;

  @Column
  userId: number;

  @Column
  role: string;

  @Column
  route: string;

  @Column(DataType.TEXT)
  message: string;

  @Column(DataType.TEXT)
  stack: string;

  @Column(DataType.TEXT)
  components: string;

  @Column
  userAgent: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ClientError;
