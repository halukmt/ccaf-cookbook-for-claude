// 3b. The client SDK's public types.
export interface ApiErrorBody {
  message: string;
}
export declare class ApiError extends Error {
  status: number;
  constructor(body: ApiErrorBody, status: number);
}
