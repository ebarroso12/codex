import { Controller, Get } from "@nestjs/common";
import { SystemService } from "./system.service";

@Controller("system")
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get("status")
  status() {
    return this.system.getStatus();
  }
}
