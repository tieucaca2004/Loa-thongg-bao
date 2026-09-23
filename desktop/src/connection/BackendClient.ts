import WebSocket from 'ws';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface PaymentReceivedEvent {
  type: 'PAYMENT_RECEIVED';
  transactionId: string;
  amount: number;
  content: string | null;
  transactionDate: string | null;
  referenceCode: string | null;
  provider: string;
}

export interface BackendClientOptions {
  url: string;
  reconnectDelayMs?: number;
  onStatusChange?: (status: ConnectionStatus) => void;
  onEvent?: (event: PaymentReceivedEvent) => void;
  onError?: (message: string) => void;
  /** Injectable for tests; defaults to the real `ws` WebSocket. */
  createSocket?: (url: string) => WebSocket;
}

/**
 * Maintains a WebSocket connection to the backend's event stream, with
 * automatic reconnect. Desktop restart / connection loss must not crash the
 * app or lose future events (project spec test 7).
 */
export class BackendClient {
  private status: ConnectionStatus = 'disconnected';
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BackendClientOptions) {}

  connect(): void {
    this.stopped = false;
    this.openSocket();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private openSocket(): void {
    this.setStatus('connecting');
    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(this.options.url);
    this.socket = socket;

    socket.on('open', () => this.setStatus('connected'));

    socket.on('message', (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed && parsed.type === 'PAYMENT_RECEIVED') {
          this.options.onEvent?.(parsed as PaymentReceivedEvent);
        }
        // 'CONNECTED' handshake message is otherwise ignored.
      } catch (err) {
        this.options.onError?.(`Failed to parse event: ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    socket.on('close', () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    });

    socket.on('error', (err: Error) => {
      this.options.onError?.(err.message);
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.options.reconnectDelayMs ?? 3000;
    this.reconnectTimer = setTimeout(() => {
      if (!this.stopped) this.openSocket();
    }, delay);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
