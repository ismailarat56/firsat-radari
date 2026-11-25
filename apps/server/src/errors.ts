export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export function assertFound<T>(value: T | undefined, label = 'Kayıt'): T {
  if (value === undefined) throw new AppError('NOT_FOUND', `${label} bulunamadı.`, 404);
  return value;
}
