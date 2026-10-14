import Queue from "../models/Queue";
import User from "../models/User";
import Whatsapp from "../models/Whatsapp";
import { roleOf } from "./Roles";

interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  role: string;
  coordArea: string | null;
  queues: Queue[];
  whatsapp: Whatsapp;
}

export const SerializeUser = (user: User): SerializedUser => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    role: roleOf(user),
    coordArea: user.coordArea || null,
    queues: user.queues,
    whatsapp: user.whatsapp
  };
};
