import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

import { describeError, handleExceptionCode } from '../utils';

describe('handleExceptionCode', () => {
  it('should wrap an unknown failure as 400 carrying the service message', () => {
    const result = handleExceptionCode(
      new Error('column "foo" does not exist'),
      '[SomeService]Doing the thing was failed',
    );

    expect(result).toBeInstanceOf(HttpException);
    expect(result.getStatus()).toBe(400);
    // The internals of a driver error must not reach the caller.
    expect(result.getResponse()).toEqual({
      statusCode: 400,
      message: '[SomeService]Doing the thing was failed',
    });
  });

  it('should keep the status of an error that already is an HttpException', () => {
    const result = handleExceptionCode(
      new NotFoundException('missing'),
      '[SomeService]Reading was failed',
    );

    // A deliberate 404 raised deeper down must not be flattened into a 400.
    expect(result.getStatus()).toBe(404);
  });

  it('should carry a domain code through the layers above it', () => {
    const result = handleExceptionCode(
      new BadRequestException({ message: 'ambiguous line', code: 2101 }),
      '[SomeService]Ingesting was failed',
    );

    expect(result.getResponse()).toEqual({
      statusCode: 400,
      message: '[SomeService]Ingesting was failed',
      code: 2101,
    });
  });

  it('should not invent a code when the inner exception has none', () => {
    const result = handleExceptionCode(
      new ConflictException('duplicate'),
      '[SomeService]Writing was failed',
    );

    expect(result.getStatus()).toBe(409);
    expect(result.getResponse()).not.toHaveProperty('code');
  });
});

describe('describeError', () => {
  it('should include the fields JSON.stringify drops on an Error', () => {
    const described = describeError(new Error('boom'));

    // A bare JSON.stringify(new Error('boom')) yields '{}'.
    expect(described).toContain('boom');
    expect(described).toContain('stack');
  });

  it('should survive a thrown non-Error', () => {
    expect(describeError('just a string')).toContain('just a string');
  });
});
