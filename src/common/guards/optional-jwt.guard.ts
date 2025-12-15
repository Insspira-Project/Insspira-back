import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // ✅ No lanzar error si no hay token - solo continuar sin user
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Si hay user, lo devolvemos
    if (user) {
      console.log('👤 User authenticated:', user.sub?.substring(0, 8) + '...');
      return user;
    }
    
    // Si no hay user, devolvemos null (no error)
    console.log('👻 Anonymous request (no token or invalid)');
    return null;
  }
}