import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthContext } from './auth.service';

/** Any signed-in member. */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const a = this.auth.resolve(req);
    if (!a) throw new UnauthorizedException();
    req.fxr = a;
    return true;
  }
}

/**
 * Panel access. Anyone who is not an admin gets a plain 404, exactly like a page that does not exist,
 * so the panel API does not even confirm it is there.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const a = this.auth.resolve(req);
    if (!a || !a.admin) throw new NotFoundException();
    req.fxr = a;
    return true;
  }
}

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest<Request>().fxr!;
});
