/**
 * The ONE accepted `ValidationPipe` configuration of this API.
 *
 * Normative sources: `00` §8.4 (whitelist, reject unknown fields, no implicit type coercion),
 * `03` §8 and §9 (the `422 VALIDATION_ERROR` document and its `errors[]` member), D-008.
 *
 * WHY THIS CONSTANT EXISTS
 *
 * Until the settings write slice there was exactly one `ValidationPipe` in the process — the
 * global one installed by `configureApplication` — so its option literal could live at its only
 * call site. `PATCH /practices/{practiceId}/settings` needs a SECOND pipe, because its body may
 * be validated only AFTER the caller has been authenticated, admitted and authorised, and a
 * global parameter pipe necessarily runs BEFORE the controller method that opens the tenant
 * transaction (`03` §3.7.1, D-047 clause 8). A route that built its own option literal would be
 * free to drift from the global one, and the two would then disagree about what a valid request
 * body is — a difference no status code would reveal until a payload behaved differently on one
 * route than on another.
 *
 * The literal is therefore extracted here VERBATIM and shared. This module introduces no new
 * option, changes no value, and is a behaviour-preserving move: the global pipe of
 * `configureApplication` and the delayed body validator of the settings write path are
 * constructed from this same frozen object, so "valid" means one thing in this process.
 *
 * EVERY OPTION IS LOAD-BEARING
 *
 * - `whitelist` strips properties no DTO declares, so an unmodelled member can never reach a
 *   service;
 * - `forbidNonWhitelisted` turns that stripping into an explicit `UNKNOWN_FIELD` refusal rather
 *   than a silent drop — the difference between "we ignored your field" and "we told you";
 * - `forbidUnknownValues` refuses a payload whose type carries no validation metadata at all;
 * - `transform` produces a DTO instance, while `enableImplicitConversion: false` keeps the pipe
 *   from coercing `"true"` into `true` or `"1"` into `1`. For a settings resource whose fields
 *   are booleans, implicit conversion would silently accept a string and persist a coerced
 *   value the caller never sent;
 * - `stopAtFirstError: false` reports every invalid field of one request instead of making a
 *   client discover them one round trip at a time;
 * - `validationError.target` and `validationError.value` are both `false`, so neither the DTO
 *   instance nor the REJECTED VALUE is attached to the error — which is what keeps a rejected
 *   payload out of the response body and out of any log line (`09` §11);
 * - `exceptionFactory` routes every failure through the single `ApiException` shape, so no
 *   endpoint can invent an error document (D-008).
 */

import { type ValidationPipeOptions } from '@nestjs/common';

import { createValidationException } from '../errors/validation-exception.factory.js';

export const API_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = Object.freeze({
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  stopAtFirstError: false,
  validationError: { target: false, value: false },
  exceptionFactory: createValidationException,
});
