import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StreamService } from './stream.service';

const CONTENT = Buffer.from('0123456789abcdef');

interface MockResponse {
  response: Response;
  headers: Record<string, unknown>;
  statusOf: () => number;
  body: () => Promise<Buffer>;
}

function mockResponse(): MockResponse {
  const sink = new PassThrough();
  const finish = sink.end.bind(sink);
  const headers: Record<string, unknown> = {};
  let statusCode = 200;
  const response = Object.assign(sink, {
    setHeader(name: string, value: unknown) {
      headers[name.toLowerCase()] = value;
      return response;
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    end() {
      finish();
      return response;
    },
  }) as unknown as Response;

  return {
    response,
    headers,
    statusOf: () => statusCode,
    body: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of sink) {
        chunks.push(chunk as Buffer);
      }
      return Buffer.concat(chunks);
    },
  };
}

function mockRequest(range?: string): Request {
  return { headers: range ? { range } : {} } as Request;
}

describe('StreamService.streamFile', () => {
  let dir: string;
  let file: string;
  let service: StreamService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stream-service-'));
    file = join(dir, 'song.mp3');
    writeFileSync(file, CONTENT);
    service = new StreamService(null as never, null as never);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the whole file with validators', async () => {
    const res = mockResponse();

    service.streamFile(file, 'audio/mpeg', mockRequest(), res.response);

    expect(await res.body()).toEqual(CONTENT);
    expect(res.headers['content-length']).toBe(CONTENT.length);
    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['etag']).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(res.headers['last-modified']).toBeTypeOf('string');
  });

  it('serves a byte range', async () => {
    const res = mockResponse();

    service.streamFile(file, 'audio/mpeg', mockRequest('bytes=4-7'), res.response);

    expect(await res.body()).toEqual(Buffer.from('4567'));
    expect(res.statusOf()).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 4-7/${CONTENT.length}`);
    expect(res.headers['content-length']).toBe(4);
  });

  it('rejects a range past the end of the file', async () => {
    const res = mockResponse();

    service.streamFile(file, 'audio/mpeg', mockRequest('bytes=99-'), res.response);

    expect(res.statusOf()).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${CONTENT.length}`);
  });

  it('reports a missing file as not found instead of throwing ENOENT', () => {
    const res = mockResponse();

    expect(() =>
      service.streamFile(join(dir, 'gone.mp3'), 'audio/mpeg', mockRequest(), res.response),
    ).toThrow(NotFoundException);
  });
});
