import { BadRequestException } from '@nestjs/common';
import { isErrorCode } from '@ft/shared';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';

/**
 * nestjs-zod's validation pipe, with one change: what it sends when a request
 * fails its schema.
 *
 * The stock pipe answers `"message": "Validation failed"` and puts the details
 * under `errors`. The browser's readCode only reads `message`, so it found no
 * code and showed the generic "Something went wrong". This one puts the codes
 * in `message` itself:
 *
 *   { "statusCode": 400, "message": ["email.invalid", "password.tooShort"] }
 *
 * The codes are the Zod issues' messages: every rule in @ft/shared declares an
 * ERROR_CODES entry as its message (see packages/shared/src/schemas/errors.ts).
 *
 * Used for every body (the global pipe in app.setup.ts) and for the `:lang`
 * route parameter (LangParam in courses.controller.ts). Anything that never
 * reaches a pipe, such as a body that is not JSON, is ErrorCodeFilter's job.
 *
 * createZodValidationPipe returns a class, not an instance: create it with
 * `new CodeValidationPipe()`, or `new CodeValidationPipe(schema)` for a
 * parameter that has no DTO.
 */
export const CodeValidationPipe = createZodValidationPipe({
  // nestjs-zod types the error as unknown, so check it is Zod's before reading issues.
  createValidationException: (error: unknown) =>
    new BadRequestException(
      error instanceof ZodError
        ? [
            // A Set keeps one copy of each code: three mistyped fields give one
            // `request.invalid`, not three. Spread back into an array, which is
            // what BadRequestException puts in `message`.
            ...new Set(
              error.issues.map((issue) =>
                // An issue no rule names (the body is not an object, a key holds
                // the wrong type) carries Zod's English default instead of a code.
                isErrorCode(issue.message) ? issue.message : 'request.invalid',
              ),
            ),
          ]
        : // Never happens with nestjs-zod, which always passes a ZodError: a
          // code anyway, so even this branch keeps the contract.
          'request.invalid',
    ),
});
