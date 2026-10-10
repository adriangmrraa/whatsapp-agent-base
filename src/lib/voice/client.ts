// ─── Internal voice agent — browser client ───────────────────────────────────
//
// Drives the WebRTC audio transport for the staff-facing Realtime agent and
// forwards every function call to the server-side tool bridge. The browser
// never sees the API key: it authenticates to OpenAI with the short-lived
// ephemeral secret minted by /api/voice/session, and authenticates to this app
// with the existing staff session cookie.
//
// Browser-only. Import it from a client component; it touches no DOM at module
// scope and throws a clear error if constructed on the server.

export type VoiceClientStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface VoiceClientEvents {
  onStatus?: (status: VoiceClientStatus) => void;
  /** Final transcription of a spoken user turn. */
  onUserTranscript?: (text: string) => void;
  /** Incremental assistant transcript (append to build the reply). */
  onAssistantTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}

interface SessionStartResponse {
  sessionId: string;
  clientSecret: string;
  model: string;
  voice: string;
  expiresAt: number;
}

const REALTIME_CONNECT_PATH = "/realtime";

export class InternalVoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private sessionId: string | null = null;
  private model = "gpt-4o-realtime-preview";
  private readonly events: VoiceClientEvents;

  constructor(events: VoiceClientEvents = {}) {
    if (typeof window === "undefined") {
      throw new Error("InternalVoiceClient is browser-only");
    }
    this.events = events;
  }

  private setStatus(status: VoiceClientStatus): void {
    this.events.onStatus?.(status);
  }

  async connect(): Promise<void> {
    if (this.pc) return;
    this.setStatus("connecting");
    try {
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`session_start_failed:${response.status}`);
      }
      const session = (await response.json()) as SessionStartResponse;
      this.sessionId = session.sessionId;
      this.model = session.model;

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const pc = new RTCPeerConnection();
      this.pc = pc;

      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      pc.ontrack = (event) => {
        if (this.audioEl) this.audioEl.srcObject = event.streams[0];
      };

      for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);

      this.dc = pc.createDataChannel("oai-events");
      this.dc.onmessage = (event) => this.handleServerEvent(event);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1${REALTIME_CONNECT_PATH}?model=${encodeURIComponent(this.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${session.clientSecret}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
        },
      );
      if (!sdpResponse.ok) {
        throw new Error(`realtime_connect_failed:${sdpResponse.status}`);
      }
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
      this.setStatus("connected");
    } catch (error) {
      this.events.onError?.(error instanceof Error ? error.message : "voice_error");
      await this.disconnect();
      this.setStatus("error");
      throw error;
    }
  }

  private handleServerEvent(event: MessageEvent): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.data as string) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = payload.type as string | undefined;

    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = payload.transcript;
      if (typeof transcript === "string" && transcript.trim()) {
        this.events.onUserTranscript?.(transcript.trim());
      }
      return;
    }

    if (type === "response.audio_transcript.delta") {
      const delta = payload.delta;
      if (typeof delta === "string") this.events.onAssistantTranscript?.(delta);
      return;
    }

    if (type === "response.function_call_arguments.done") {
      void this.runFunctionCall(payload);
      return;
    }

    if (type === "error") {
      const error = payload.error as { message?: string } | undefined;
      this.events.onError?.(error?.message ?? "realtime_error");
    }
  }

  private async runFunctionCall(payload: Record<string, unknown>): Promise<void> {
    const callId = payload.call_id as string | undefined;
    const name = payload.name as string | undefined;
    const argsRaw = payload.arguments;
    if (!this.sessionId || !callId || !name) return;

    let result: unknown = { error: "tool_failed" };
    try {
      const response = await fetch("/api/voice/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          callId,
          name,
          arguments: typeof argsRaw === "string" ? argsRaw : "{}",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        result?: unknown;
        error?: string;
      };
      result = body.result ?? { error: body.error ?? "tool_failed" };
    } catch (error) {
      result = { error: error instanceof Error ? error.message : "tool_failed" };
    }

    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.send({ type: "response.create" });
  }

  private send(event: Record<string, unknown>): void {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(event));
    }
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  async disconnect(): Promise<void> {
    const sessionId = this.sessionId;
    this.sessionId = null;
    try {
      this.dc?.close();
      this.pc?.getSenders().forEach((sender) => sender.track?.stop());
      this.pc?.close();
      this.stream?.getTracks().forEach((track) => track.stop());
      if (this.audioEl) this.audioEl.srcObject = null;
    } finally {
      this.dc = null;
      this.pc = null;
      this.stream = null;
      this.audioEl = null;
      if (sessionId) {
        await fetch("/api/voice/session", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }).catch(() => undefined);
      }
      this.setStatus("disconnected");
    }
  }
}
