export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource}_not_found`, `${resource} with id ${id} not found`, 404);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super('validation_error', message, 422);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super('conflict', message, 409);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Unauthorized') {
    super('unauthorized', message, 401);
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(fromState: string, event: string) {
    super('invalid_transition', `Invalid transition: ${fromState} + ${event}`, 422);
  }
}

export class CouponExpiredError extends DomainError {
  constructor(code: string) {
    super('coupon_expired', `Coupon ${code} has expired`, 422);
  }
}

export class CouponExhaustedError extends DomainError {
  constructor(code: string) {
    super('coupon_exhausted', `Coupon ${code} has reached its maximum redemptions`, 422);
  }
}

export class CouponCurrencyMismatchError extends DomainError {
  constructor(code: string, expected: string, received: string) {
    super('coupon_currency_mismatch', `Coupon ${code} requires currency ${expected}, got ${received}`, 422);
  }
}

export class CouponNotFoundError extends DomainError {
  constructor(code: string) {
    super('coupon_not_found', `Coupon with code ${code} not found`, 404);
  }
}
