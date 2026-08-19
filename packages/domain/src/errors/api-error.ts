export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
}

export function createApiError(
  code: string,
  message: string,
  requestId: string,
  details: Record<string, unknown> = {},
): ApiErrorBody {
  return { error: { code, message, details, requestId } };
}
