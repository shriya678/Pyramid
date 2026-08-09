import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type ms from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';
import { WorkspaceProvisioningService } from './workspace-provisioning.service';

// Only register GoogleStrategy when the OAuth creds are actually set. Without
// this guard, a dev without Google creds locally would fail to boot the app.
// If creds are missing, /auth/google routes exist but return 500 (Passport:
// "Unknown authentication strategy 'google'") — that's the intended signal.
const googleStrategyProvider: Provider = {
  provide: GoogleStrategy,
  useFactory: (config: ConfigService) => {
    const hasCreds = Boolean(
      config.get<string>('GOOGLE_CLIENT_ID') &&
      config.get<string>('GOOGLE_CLIENT_SECRET') &&
      config.get<string>('GOOGLE_CALLBACK_URL'),
    );
    if (!hasCreds) {
      new Logger('AuthModule').warn(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_CALLBACK_URL not set — /auth/google routes will 500 until they are.',
      );
      return null;
    }
    return new GoogleStrategy(config);
  },
  inject: [ConfigService],
};

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
  providers: [
    AuthService,
    TokensService,
    WorkspaceProvisioningService,
    JwtStrategy,
    googleStrategyProvider,
  ],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
