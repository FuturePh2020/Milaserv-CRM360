import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import configuration from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { TeamsModule } from "./teams/teams.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { ImportsModule } from "./imports/imports.module";
import { SessionsModule } from "./sessions/sessions.module";
import { DevicesModule } from "./devices/devices.module";
import { AuditModule } from "./audit/audit.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    ShiftsModule,
    ImportsModule,
    SessionsModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [
    // Every endpoint requires a valid access token unless annotated @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Role checks run after authentication; @Roles() opts a route into RBAC enforcement.
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
