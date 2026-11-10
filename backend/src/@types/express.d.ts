declare namespace Express {
  export interface Request {
    user: { id: string; profile: string; role: string; coordArea?: string | null };
    // set by the student portal middleware (not a user of the system)
    student?: import("../models/Student").default;
  }
}
