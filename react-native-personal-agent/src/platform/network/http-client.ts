type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | unknown;
  timeoutMs?: number;
};

type UploadFile = {
  uri: string;
  name: string;
  type: string;
};

export class HttpClient {
  constructor(
    private readonly baseUrl?: string,
    private readonly timeoutMs: number = 10000
  ) {}

  async get<T>(path: string, init?: Omit<RequestOptions, 'body'>): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, init?: Omit<RequestOptions, 'body'>): Promise<T> {
    return this.request<T>(path, { ...init, method: 'POST', body });
  }

  async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), init.timeoutMs ?? this.timeoutMs);

    try {
      const headers = new Headers(init.headers);
      let body = init.body as BodyInit | undefined;

      if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(init.body);
      }

      headers.set('Accept', 'application/json');

      const response = await fetch(this.toUrl(path), {
        ...init,
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      return (await response.text()) as T;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async uploadFile<T>(
    path: string,
    file: UploadFile,
    fields: Record<string, string | number> = {}
  ): Promise<T> {
    const formData = new FormData();

    Object.entries(fields).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    formData.append('file', file as unknown as Blob);

    return this.request<T>(path, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  private toUrl(path: string): string {
    if (/^https?:\/\//.test(path) || !this.baseUrl) {
      return path;
    }

    return `${this.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
}
