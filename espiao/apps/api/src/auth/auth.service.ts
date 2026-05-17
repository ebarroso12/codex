import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CurrentUser } from "./current-user.type";
import { Role } from "./roles.enum";

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  issueDevelopmentToken() {
    const payload: CurrentUser = {
      sub: "dev-user",
      email: "admin@example.com",
      role: Role.ADMIN
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tokenType: "Bearer"
    };
  }
}
