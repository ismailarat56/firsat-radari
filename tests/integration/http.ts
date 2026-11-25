import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { Express } from 'express';
export type Response = { status: number; body: any; headers: Record<string, any>; text: string };
class Agent {
  cookies = '';
  constructor(readonly app: Express) {}
  get(url: string) {
    return new Pending(this, 'GET', url);
  }
  post(url: string) {
    return new Pending(this, 'POST', url);
  }
  patch(url: string) {
    return new Pending(this, 'PATCH', url);
  }
  delete(url: string) {
    return new Pending(this, 'DELETE', url);
  }
}
class Pending implements PromiseLike<Response> {
  headers: Record<string, string> = { host: '127.0.0.1:4318' };
  data: unknown;
  constructor(
    readonly agent: Agent,
    readonly method: string,
    readonly url: string,
  ) {}
  set(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  send(body: unknown) {
    this.data = body;
    return this;
  }
  async execute(): Promise<Response> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const req = new IncomingMessage(socket);
      req.method = this.method;
      req.url = this.url;
      req.headers = { ...this.headers };
      if (this.agent.cookies) req.headers.cookie = this.agent.cookies;
      const body = this.data === undefined ? '' : JSON.stringify(this.data);
      if (body) {
        req.headers['content-type'] = 'application/json';
        req.headers['content-length'] = String(Buffer.byteLength(body));
      }
      const res = new ServerResponse(req);
      const chunks: Buffer[] = [];
      let ended = false;
      res.write = ((chunk: any, encoding?: BufferEncoding) => {
        if (!ended) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        return true;
      }) as typeof res.write;
      res.end = ((
        chunk?: any,
        encodingOrCallback?: BufferEncoding | (() => void),
        callback?: () => void,
      ) => {
        if (ended) return res;
        ended = true;
        if (chunk && typeof chunk !== 'function')
          chunks.push(
            Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(
                  chunk,
                  typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined,
                ),
          );
        const text = Buffer.concat(chunks).toString();
        chunks.length = 0;
        const headers = res.getHeaders();
        if (headers['set-cookie'] && !Array.isArray(headers['set-cookie']))
          headers['set-cookie'] = [String(headers['set-cookie'])];
        const cookies = headers['set-cookie'];
        if (cookies)
          this.agent.cookies = (Array.isArray(cookies) ? cookies : [cookies])
            .map((c) => String(c).split(';')[0])
            .join('; ');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = undefined;
        }
        res.finished = true;
        res.emit('finish');
        req.destroy();
        socket.destroy();
        if (typeof chunk === 'function') chunk();
        if (typeof encodingOrCallback === 'function') encodingOrCallback();
        callback?.();
        resolve({ status: res.statusCode, body: parsed, headers, text });
        return res;
      }) as typeof res.end;
      req.on('error', reject);
      this.agent.app(req, res);
      if (body && !req.destroyed) req.push(body);
      if (!req.destroyed) req.push(null);
    });
  }
  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}
export function request(app: Express) {
  return new Agent(app);
}
request.agent = (app: Express) => new Agent(app);
