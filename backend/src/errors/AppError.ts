class AppError {
  public readonly message: string;

  public readonly statusCode: number;

  // extra facts for the screen (for example, which conversation is already open)
  public readonly data?: Record<string, any>;

  constructor(message: string, statusCode = 400, data?: Record<string, any>) {
    this.message = message;
    this.statusCode = statusCode;
    this.data = data;
  }
}

export default AppError;
