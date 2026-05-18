import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that invokes the local (registry + password) Passport strategy.
 * Applied manually on the POST /auth/login route only.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
