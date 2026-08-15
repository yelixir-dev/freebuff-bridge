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
    super("upstream_error", message, 502);
    this.name = "UpstreamError";
    this.upstreamStatus = upstreamStatus;
  }
}
