import { HttpStatus } from '@nestjs/common';
import { type ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { createValidationException } from './validation-exception.factory.js';

function validationError(
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children };
}

describe('createValidationException', () => {
  it('given constraint failures when converted then a 422 VALIDATION_ERROR problem is produced', () => {
    const exception = createValidationException([
      validationError('treatmentDate', { isDateString: 'treatmentDate must be a valid date.' }),
    ]);

    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.code).toBe('VALIDATION_ERROR');
    expect(exception.detail).toBe('One or more fields are invalid.');
    expect(exception.errors).toStrictEqual([
      {
        field: 'treatmentDate',
        code: 'INVALID_DATE',
        message: 'treatmentDate must be a valid date.',
      },
    ]);
  });

  it('given a nested failure when converted then the field path is dotted', () => {
    const exception = createValidationException([
      validationError('patient', {}, [
        validationError('birthYear', { isInt: 'birthYear must be an integer number' }),
      ]),
    ]);

    expect(exception.errors?.[0]?.field).toBe('patient.birthYear');
    expect(exception.errors?.[0]?.code).toBe('INVALID_NUMBER');
  });

  it('given an unknown property when converted then it maps to UNKNOWN_FIELD', () => {
    const exception = createValidationException([
      validationError('unexpected', {
        whitelistValidation: 'property unexpected should not exist',
      }),
    ]);

    expect(exception.errors?.[0]?.code).toBe('UNKNOWN_FIELD');
  });

  it('given an unmapped constraint when converted then it falls back to INVALID_VALUE', () => {
    const exception = createValidationException([
      validationError('custom', { someExoticConstraint: 'custom is not acceptable' }),
    ]);

    expect(exception.errors?.[0]?.code).toBe('INVALID_VALUE');
  });

  it('given several failures when converted then all of them are reported', () => {
    const exception = createValidationException([
      validationError('a', { isNotEmpty: 'a should not be empty' }),
      validationError('b', { isUuid: 'b must be a UUID' }),
    ]);

    expect(exception.errors).toHaveLength(2);
    expect(exception.errors?.map((error) => error.code)).toStrictEqual([
      'REQUIRED',
      'INVALID_UUID',
    ]);
  });
});
