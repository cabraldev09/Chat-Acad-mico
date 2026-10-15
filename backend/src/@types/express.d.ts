declare namespace Express {
  export interface Request {
    user: { id: string; profile: string; role: string };
    // set by the student portal middleware (not a user of the system)
    student?: import("../models/Student").default;
  }
}
