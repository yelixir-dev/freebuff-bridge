export class BridgeError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  public constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ConfigError extends BridgeError {
  public constructor(message: string) {
    super("config_error", message, 500);
    this.name = "ConfigError";
  }
}

export class AuthError extends BridgeError {
  public constructor(message = "Unauthorized") {
    super("unauthorized", message, 401);
    this.name = "AuthError";
  }
}

export class ModelNotAllowedError extends BridgeError {
  public constructor(model: string) {
    super("model_not_allowed", `Model not allowed: ${model}`, 400);
    this.name = "ModelNotAllowedError";
  }
}

export class NoAvailableCredentialError extends BridgeError {
  public constructor(message = "No available Freebuff credentials") {
    super("no_available_credential", message, 503);
    this.name = "NoAvailableCredentialError";
  }
}

export class UpstreamError extends BridgeError {
  public readonly upstreamStatus: number;

  public constructor(message: string, upstreamStatus: number) {
    const statusCode = upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502;
    super("upstream_error", message, statusCode);
    this.name = "UpstreamError";
    this.upstreamStatus = upstreamStatus;
  }
}

export class EmptyVisibleResponseError extends BridgeError {
  public constructor() {
    super(
      "freebuff_empty_visible_response",
      "Freebuff upstream returned no visible text or tool calls",
      502,
    );
    this.name = "EmptyVisibleResponseError";
  }
}

export class UnsupportedToolsError extends BridgeError {
  public constructor() {
    super(
      "freebuff_tools_unsupported",
      'Freebuff free-mode cannot safely execute client tools; omit tools or set tool_choice to "none"',
      400,
    );
    this.name = "UnsupportedToolsError";
  }
}

export class InvalidUpstreamResponseError extends BridgeError {
  public constructor(message = "Freebuff upstream returned an invalid completion envelope") {
    super("freebuff_invalid_response", message, 502);
    this.name = "InvalidUpstreamResponseError";
  }
}
