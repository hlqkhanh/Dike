import { ValidationPipe, type Type } from '@nestjs/common';

// tsx/esbuild do not emit design:paramtypes. Keep validation identical in dev and builds.
export function strictDto(expectedType: Type<unknown>) {
  return new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}
