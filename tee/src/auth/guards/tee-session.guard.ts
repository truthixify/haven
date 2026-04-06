import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../storage/database.service';

/**
 * TEE Session Guard
 *
 * Validates that incoming requests come from authenticated TEE sessions.
 * Checks that the request includes a valid identity commitment header
 * and that the corresponding user record exists in sealed storage.
 *
 * In production, this would also verify Phala TEE attestation of the
 * request origin. For development, it validates the identity commitment
 * against sealed storage.
 */
@Injectable()
export class TeeSessionGuard implements CanActivate {
  private readonly logger = new Logger(TeeSessionGuard.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // The identity commitment is passed as a header from the dashboard.
    // The dashboard obtains it after the user signs an identity message
    // with their CKB wallet via CCC.
    const identityCommitment = request.headers[
      'x-haven-identity'
    ] as string;

    if (!identityCommitment) {
      this.logger.warn('Request missing X-Haven-Identity header');
      throw new UnauthorizedException(
        'Missing identity commitment. Connect your CKB wallet first.',
      );
    }

    // Validate hex format
    if (!/^[0-9a-f]{64}$/i.test(identityCommitment)) {
      this.logger.warn('Invalid identity commitment format');
      throw new UnauthorizedException(
        'Invalid identity commitment format.',
      );
    }

    // Check that the user exists in sealed storage
    const exists = await this.databaseService.hasUserRecord(
      identityCommitment,
    );
    if (!exists) {
      this.logger.warn(
        `Unknown identity: ${identityCommitment.substring(0, 16)}...`,
      );
      throw new UnauthorizedException(
        'Unknown identity. Complete wallet verification first.',
      );
    }

    // Attach the identity commitment to the request for downstream use
    (request as any).identityCommitment = identityCommitment;

    return true;
  }
}
