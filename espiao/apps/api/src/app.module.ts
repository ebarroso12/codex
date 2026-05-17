import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AiAnalysisModule } from "./ai-analysis/ai-analysis.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";
import { AuthModule } from "./auth/auth.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { EmployeesModule } from "./employees/employees.module";
import { HealthController } from "./health.controller";
import { MessagesModule } from "./messages/messages.module";
import { PatientsModule } from "./patients/patients.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SystemModule } from "./system/system.module";
import { ReportsModule } from "./reports/reports.module";
import { UsersModule } from "./users/users.module";
import { validateEnv } from "./shared/config/env.validation";
import { WhatsappModule } from "./whatsapp/whatsapp.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv
    }),
    ...(process.env.NODE_ENV === "test"
      ? []
      : [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              connection: {
                host: config.get<string>("REDIS_HOST", "localhost"),
                port: config.get<number>("REDIS_PORT", 6379),
                password: config.get<string>("REDIS_PASSWORD") || undefined
              }
            })
          })
        ]),
    RealtimeModule,
    SystemModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    PatientsModule,
    ConversationsModule,
    MessagesModule,
    WhatsappModule,
    AiAnalysisModule,
    ReportsModule,
    AuditLogsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
