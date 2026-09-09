import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super_secret_change_in_production',
    });
  }

  async validate(payload: any) {
    // The payload will contain whatever we signed in the auth service (e.g., userId, role, email)
    if (!payload) {
      throw new UnauthorizedException();
    }
    return payload; // This object will be attached to req.user
  }
}
