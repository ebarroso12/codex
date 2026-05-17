import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("conversations")
export class ConversationsController {
  @Get()
  list() {
    return { data: [], module: "conversations" };
  }
}
