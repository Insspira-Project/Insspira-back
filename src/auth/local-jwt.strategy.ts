// src/auth/strategies/local-jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class LocalJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // ✅ 1. Intentar leer de cookies (Google OAuth guarda aquí)
        (req: Request) => {
          if (req && req.cookies) {
            const token = req.cookies.jwt || req.cookies['auth-token'];
            if (token) {
              console.log('🍪 JWT from cookie found:', token.substring(0, 20) + '...');
              return token;
            }
          }
          console.log('⚠️ No JWT in cookies');
          return null;
        },
        // ✅ 2. Si no hay cookie, intentar Authorization header (login local)
        ExtractJwt.fromAuthHeaderAsBearerToken()
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your_jwt_secret',
    });
  }

  async validate(payload: any) {
    console.log('✅ JWT validated for user:', payload.sub?.substring(0, 8) + '...');
    return { 
      sub: payload.sub, 
      email: payload.email, 
      id: payload.sub,
      isAdmin: payload.isAdmin 
    };
  }
}