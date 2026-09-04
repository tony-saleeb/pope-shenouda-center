import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

export function newCorrelationId(): string {
  return randomUUID();
}

export function genericApiError(
  correlationId: string,
  messageAr = 'حدث خطأ، برجاء المحاولة مرة أخرى',
  status = 500
) {
  return NextResponse.json(
    {
      error: 'Internal server error',
      messageAr,
      correlationId,
    },
    { status }
  );
}
