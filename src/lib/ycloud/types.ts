export type SendTextResult =
  | { ok: true; wamid?: string }
  | { ok: false; error: string };

export interface YCloudResponse {
  id: string;
  status: string;
}

export type MediaTypes =
  | "image"
  | "audio"
  | "document"
  | "video"
  | "sticker"
  | "location";
