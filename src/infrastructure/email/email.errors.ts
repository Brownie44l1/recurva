import { DomainError } from '../../errors';

export class EmailError extends DomainError {
  constructor(message: string, statusCode: number = 500) {
    super('email_error', message, statusCode);
  }
}

export class EmailConfigurationError extends EmailError {
  constructor(message: string) {
    super(message, 500);
  }
}

export class EmailSendError extends EmailError {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message, 502);
  }
}

export class EmailRateLimitError extends EmailError {
  constructor() {
    super('Email rate limit exceeded', 429);
  }
}

export class InvalidEmailAddressError extends EmailError {
  constructor(address: string) {
    super(`Invalid email address: ${address}`, 422);
  }
}

export class EmailTemplateError extends EmailError {
  constructor(template: string, originalError?: unknown) {
    const detail = originalError instanceof Error ? originalError.message : 'Unknown error';
    super(`Failed to render template "${template}": ${detail}`, 500);
  }
}
