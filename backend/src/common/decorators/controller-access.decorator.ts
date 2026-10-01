import { SetMetadata } from '@nestjs/common';

export const CONTROLLER_ACCESS_KEY = 'controllerAccess';

/**
 * Opens a route to CONTROLLER sessions. Controllers (ticket scanners) are denied
 * every authenticated route by default — JwtAuthGuard only lets them through
 * routes marked with this decorator.
 */
export const ControllerAccess = () => SetMetadata(CONTROLLER_ACCESS_KEY, true);
