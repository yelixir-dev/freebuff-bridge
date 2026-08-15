export function openaiError(
  status: number,
  message: string,
  type = "invalid_request_error",
  code: string | null = null,
) {
  return {
    status,
    body: { error: { message, type, param: null, code } },
  };
}
