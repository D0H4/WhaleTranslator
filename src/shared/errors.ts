export type ErrorCode =
  | "missing-key"
  | "unauthorized"
  | "rate-limited"
  | "network"
  | "service"
  | "invalid-response"
  | "restricted-page"
  | "cancelled"
  | "unknown";

export interface PublicError {
  code: ErrorCode;
  title: string;
  message: string;
  action: string | null;
}

const ERROR_COPY: Record<ErrorCode, Omit<PublicError, "code">> = {
  "missing-key": {
    title: "API 키가 필요해요",
    message: "확장 아이콘을 눌러 API 키를 먼저 저장해 주세요.",
    action: "설정 확인"
  },
  unauthorized: {
    title: "API 키를 확인해 주세요",
    message: "API 서버가 이 키를 인증하지 못했습니다.",
    action: "다시 설정"
  },
  "rate-limited": {
    title: "요청이 잠시 제한됐어요",
    message: "잠시 기다린 뒤 같은 내용을 다시 번역해 주세요.",
    action: "다시 시도"
  },
  network: {
    title: "네트워크 연결을 확인해 주세요",
    message: "받은 번역은 그대로 두었습니다. 연결 후 다시 시도할 수 있어요.",
    action: "다시 시도"
  },
  service: {
    title: "API 서버가 응답하지 않아요",
    message: "서비스가 잠시 불안정합니다. 조금 뒤 다시 시도해 주세요.",
    action: "다시 시도"
  },
  "invalid-response": {
    title: "번역 응답을 읽지 못했어요",
    message: "원문은 그대로 유지했습니다. 다시 요청해 주세요.",
    action: "다시 시도"
  },
  "restricted-page": {
    title: "이 페이지에서는 열 수 없어요",
    message: "브라우저 설정 화면과 내장 PDF 화면은 확장 프로그램이 변경할 수 없습니다.",
    action: null
  },
  cancelled: {
    title: "번역을 중지했어요",
    message: "입력한 원문은 그대로 남아 있습니다.",
    action: "다시 번역"
  },
  unknown: {
    title: "번역하지 못했어요",
    message: "예상하지 못한 문제가 발생했습니다.",
    action: "다시 시도"
  }
};

export class WhaleTranslatorError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? code);
    this.name = "WhaleTranslatorError";
    this.code = code;
  }
}

export function getPublicError(code: ErrorCode): PublicError {
  return { code, ...ERROR_COPY[code] };
}

export function toPublicError(error: unknown): PublicError {
  if (error instanceof WhaleTranslatorError) {
    return getPublicError(error.code);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return getPublicError("cancelled");
  }
  return getPublicError("unknown");
}
