import { UserRole, UserStatus } from "@milaserv/database";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  teamId: string | null;
}
