import type { SendTextResult } from "./types";

const YCLOUD_API_URL =
  "https://api.ycloud.com/v2/whatsapp/messages/sendDirectly";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function doFetch(
  body: string,
  apiKey: string,
  signal: AbortSignal
): Promise<Response> {
  return fetch(YCLOUD_API_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body,
    signal,
  });
}

/**
 * Send a text message via YCloud API.
 * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
 * Skips retry on 4xx errors.
 * Returns the wamid when available from the response.
 */
export async function sendText(
  to: string,
  text: string
): Promise<SendTextResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = process.env.WHATSAPP_PHONE_NUMBER;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Missing YCLOUD_API_KEY or WHATSAPP_PHONE_NUMBER",
    };
  }

  const body = JSON.stringify({
    from,
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });

  for (let attempt = 0; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await doFetch(body, apiKey, controller.signal);
      clearTimeout(timeoutId);

      if (response.ok) {
        try {
          const responseData = (await response.clone().json()) as {
            id?: string;
          };
          if (responseData?.id) {
            return { ok: true, wamid: responseData.id };
          }
        } catch {
          // Non-critical — return ok without wamid
        }
        return { ok: true };
      }

      // Do not retry client errors (4xx)
      if (response.status >= 400 && response.status < 500 && attempt < 2) {
        const errorText = await response.text().catch(() => "unknown error");
        return {
          ok: false,
          error: `YCloud error ${response.status}: ${errorText}`,
        };
      }

      // Retry on server errors (5xx) or other statuses
      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const errorText = await response.text().catch(() => "unknown error");
      return { ok: false, error: `YCloud error ${response.status}: ${errorText}` };
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Fetch error: ${message}` };
    }
  }

  return { ok: false, error: "Max retries exceeded" };
}

/**
 * Send an image message via YCloud API.
 */
export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string
): Promise<SendTextResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = process.env.WHATSAPP_PHONE_NUMBER;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Missing YCLOUD_API_KEY or WHATSAPP_PHONE_NUMBER",
    };
  }

  const body = JSON.stringify({
    from,
    to,
    type: "image",
    image: { link: imageUrl, caption: caption ?? "" },
  });

  for (let attempt = 0; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await doFetch(body, apiKey, controller.signal);
      clearTimeout(timeoutId);

      if (response.ok) {
        return { ok: true };
      }

      if (response.status >= 400 && response.status < 500 && attempt < 2) {
        const errorText = await response.text().catch(() => "unknown error");
        return {
          ok: false,
          error: `YCloud error ${response.status}: ${errorText}`,
        };
      }

      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const errorText = await response.text().catch(() => "unknown error");
      return { ok: false, error: `YCloud error ${response.status}: ${errorText}` };
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Fetch error: ${message}` };
    }
  }

  return { ok: false, error: "Max retries exceeded" };
}

/**
 * Send a document message via YCloud API.
 */
export async function sendDocument(
  to: string,
  documentUrl: string,
  caption?: string,
  fileName?: string
): Promise<SendTextResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = process.env.WHATSAPP_PHONE_NUMBER;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Missing YCLOUD_API_KEY or WHATSAPP_PHONE_NUMBER",
    };
  }

  const body = JSON.stringify({
    from,
    to,
    type: "document",
    document: {
      link: documentUrl,
      caption: caption ?? "",
      filename: fileName ?? "documento.pdf",
    },
  });

  for (let attempt = 0; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await doFetch(body, apiKey, controller.signal);
      clearTimeout(timeoutId);

      if (response.ok) {
        return { ok: true };
      }

      if (response.status >= 400 && response.status < 500 && attempt < 2) {
        const errorText = await response.text().catch(() => "unknown error");
        return {
          ok: false,
          error: `YCloud error ${response.status}: ${errorText}`,
        };
      }

      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      const errorText = await response.text().catch(() => "unknown error");
      return { ok: false, error: `YCloud error ${response.status}: ${errorText}` };
    } catch (err) {
      clearTimeout(timeoutId);
      if (attempt < 2) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Fetch error: ${message}` };
    }
  }

  return { ok: false, error: "Max retries exceeded" };
}
