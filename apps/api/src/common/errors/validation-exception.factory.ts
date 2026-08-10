import { HttpStatus } from '@nestjs/common';
import { type ValidationError } from 'class-validator';

import { ApiException, type ProblemFieldError } from './api-exception.js';

/**
 * Maps a `class-validator` constraint key to a stable field level error code.
 *
 * The codes follow the `DOMAIN_REASON` convention of 12 §11 and are stable across
 * localisation (D-020). `INVALID_DATE` matches the example in 03 §8.
 */
const CONSTRAINT_CODES: Readonly<Record<string, string>> = {
  isDefined: 'REQUIRED',
  isNotEmpty: 'REQUIRED',
  isString: 'INVALID_STRING',
  isInt: 'INVALID_NUMBER',
  isNumber: 'INVALID_NUMBER',
  isPositive: 'INVALID_NUMBER',
  isBoolean: 'INVALID_BOOLEAN',
  isArray: 'INVALID_ARRAY',
  isObject: 'INVALID_OBJECT',
  isUuid: 'INVALID_UUID',
  isDate: 'INVALID_DATE',
  isDateString: 'INVALID_DATE',
  isIso8601: 'INVALID_DATE',
  isEmail: 'INVALID_EMAIL',
  isUrl: 'INVALID_URL',
  isEnum: 'INVALID_ENUM_VALUE',
  isIn: 'INVALID_ENUM_VALUE',
  matches: 'INVALID_FORMAT',
  min: 'OUT_OF_RANGE',
  max: 'OUT_OF_RANGE',
  minLength: 'INVALID_LENGTH',
  maxLength: 'INVALID_LENGTH',
  arrayMinSize: 'INVALID_LENGTH',
  arrayMaxSize: 'INVALID_LENGTH',
  // Produced by `forbidNonWhitelisted` when the payload carries an unknown property.
  whitelistValidation: 'UNKNOWN_FIELD',
};

const FALLBACK_FIELD_CODE = 'INVALID_VALUE';

function flatten(errors: readonly ValidationError[], parentPath = ''): ProblemFieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath === '' ? error.property : `${parentPath}.${error.property}`;

    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]): ProblemFieldError => ({
        field: path,
        code: CONSTRAINT_CODES[constraint] ?? FALLBACK_FIELD_CODE,
        message,
      }),
    );

    return [...own, ...flatten(error.children ?? [], path)];
  });
}

/**
 * Turns `ValidationPipe` failures into a single `VALIDATION_ERROR` problem.
 *
 * Status is `422` because the payload is syntactically valid JSON that fails semantic
 * validation (03 §9). The rejected values themselves are never copied into the response;
 * only the field path, the stable code and the constraint message are exposed.
 */
export function createValidationException(errors: ValidationError[]): ApiException {
  return new ApiException({
    code: 'VALIDATION_ERROR',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    detail: 'One or more fields are invalid.',
    errors: flatten(errors),
  });
}
