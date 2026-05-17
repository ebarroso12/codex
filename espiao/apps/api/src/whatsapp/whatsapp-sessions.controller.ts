import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WhatsappSessionsService } from "./whatsapp-sessions.service";
import type { CreateSessionInput } from "./types/whatsapp-provider.types";

@Controller("whatsapp/sessions")
@UseGuards(JwtAuthGuard)
export class WhatsappSessionsController {
  constructor(
    @Inject(WhatsappSessionsService)
    private readonly sessions: WhatsappSessionsService
  ) {}

  @Post()
  createSession(@Body() body: CreateSessionInput) {
    return this.sessions.createSession(body);
  }

  @Get(":id/qrcode")
  getQrCode(@Param("id") id: string) {
    return this.sessions.getQrCode(id);
  }

  @Get(":id/status")
  getStatus(@Param("id") id: string) {
    return this.sessions.getStatus(id);
  }

  @Delete(":id")
  @HttpCode(200)
  disconnectSession(@Param("id") id: string) {
    return this.sessions.disconnectSession(id);
  }
}
