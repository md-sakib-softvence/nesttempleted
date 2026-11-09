import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      return false;
    }

    // Login endpoints may sign the role as either `player` or `PLAYER`.
    // Normalize both sides so route authorization does not depend on casing.
    const userRole = String(user.role).trim().toUpperCase();

    // Super admin has access to everything
    if (userRole === Role.SUPER_ADMIN || userRole === 'SUPER_ADMIN') {
      return true;
    }

    return requiredRoles.some(
      (role) => {
        const requiredRole = String(role).trim().toUpperCase();
        return userRole === requiredRole || userRole.includes(requiredRole);
      },
    );
  }
}
