import { Role } from "./roles.enum";

export type CurrentUser = {
  sub: string;
  email: string;
  role: Role;
};
