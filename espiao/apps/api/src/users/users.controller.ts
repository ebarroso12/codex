import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { Role } from "../auth/roles.enum";
import { RolesGuard } from "../auth/roles.guard";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  list() {
    return { data: [], module: "users" };
  }
}
