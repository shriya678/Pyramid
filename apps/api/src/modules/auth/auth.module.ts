import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type ms from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';
import { WorkspaceProvisioningService } from './workspace-provisioning.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is not set');
        return {
          secret,
          // Per-token expiresIn is passed in TokensService.issue(); the default
          // here is a safety net for anything that calls jwt.signAsync without one.
          signOptions: {
            expiresIn: (config.get<string>('JWT_ACCESS_TTL') ?? '15m') as ms.StringValue,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, WorkspaceProvisioningService, JwtStrategy],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
