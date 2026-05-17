import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser } from "./current-user.type";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { Role } from "./roles.enum";

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  refreshTokenHash: string | null;
  role: Role;
  isActive: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  async register(input: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });

    if (existing) {
      throw new ConflictException("Email already registered.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = (await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
        role: Role.AGENT
      }
    })) as AuthenticatedUser;

    return this.issueTokenPair(user);
  }

  async login(input: LoginDto) {
    const user = (await this.prisma.user.findUnique({
      where: {
        email: input.email.toLowerCase()
      }
    })) as AuthenticatedUser | null;

    if (!user?.isActive) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    return this.issueTokenPair(user);
  }

  async refresh(input: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(input.refreshToken);
    const user = (await this.prisma.user.findUnique({
      where: {
        id: payload.sub
      }
    })) as AuthenticatedUser | null;

    if (!user?.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    const tokenMatches = await bcrypt.compare(input.refreshToken, user.refreshTokenHash);

    if (!tokenMatches) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    return this.issueTokenPair(user);
  }

  async issueTokenPair(user: Pick<AuthenticatedUser, "id" | "email" | "name" | "role">) {
    const accessPayload: CurrentUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenType: "access"
    };
    const refreshPayload: CurrentUser = {
      ...accessPayload,
      tokenType: "refresh"
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.config.get<string>("JWT_REFRESH_SECRET", "change-me-refresh-in-development"),
      expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d") as JwtSignOptions["expiresIn"]
    });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        refreshTokenHash
      }
    });

    return {
      accessToken: this.jwtService.sign(accessPayload),
      refreshToken,
      tokenType: "Bearer",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  }

  issueDevelopmentToken() {
    const payload: CurrentUser = {
      sub: "dev-user",
      email: "admin@example.com",
      role: Role.ADMIN,
      tokenType: "access"
    };

    return {
      accessToken: this.jwtService.sign(payload),
      tokenType: "Bearer"
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<CurrentUser> {
    try {
      const payload = await this.jwtService.verifyAsync<CurrentUser>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET", "change-me-refresh-in-development")
      });

      if (payload.tokenType !== "refresh") {
        throw new UnauthorizedException("Invalid refresh token.");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }
  }
}
