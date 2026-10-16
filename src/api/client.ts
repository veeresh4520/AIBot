import type { AnswerResult, EvidenceChunk, HealthResponse, KnowledgePack, Source } from '../models/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export class BackendUnavailableError extends Error {
  constructor(message = 'Backend is not connected') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

export class DeviceOfflineError extends Error {
  constructor(message = 'Device is offline. Network requests cannot be completed.') {
    super(message);
    this.name = 'DeviceOfflineError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new DeviceOfflineError();
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new DeviceOfflineError();
    }
    throw new BackendUnavailableError();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => null);
    throw new ApiError(`HTTP ${res.status}`, res.status, body);
  }

  return res.json() as Promise<T>;
}

/** Check if the backend API is reachable */
export async function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export interface AskQuestionOptions {
  cropId?: string | null;
  regionId?: string | null;
  growthStageId?: string | null;
  imageFile?: File;
  language?: string;
}

export interface PackDownloadPayload {
  pack: KnowledgePack;
  sources: Source[];
  chunks: EvidenceChunk[];
}

/** Submit a question to the Plant Doctor with complete context */
export async function askQuestion(
  query: string,
  options?: AskQuestionOptions | File
): Promise<AnswerResult> {
  const opts: AskQuestionOptions =
    options instanceof File ? { imageFile: options } : options ?? {};

  if (opts.imageFile) {
    const formData = new FormData();
    formData.append('query', query);
    formData.append('image', opts.imageFile);
    if (opts.cropId) formData.append('cropId', opts.cropId);
    if (opts.regionId) formData.append('regionId', opts.regionId);
    if (opts.growthStageId) formData.append('growthStageId', opts.growthStageId);
    if (opts.language) formData.append('language', opts.language);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new DeviceOfflineError();
    }

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/v1/ask`, {
        method: 'POST',
        body: formData,
      });
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new DeviceOfflineError();
      }
      throw new BackendUnavailableError();
    }

    if (!res.ok) {
      const body = await res.text().catch(() => null);
      throw new ApiError(`HTTP ${res.status}`, res.status, body);
    }

    return res.json() as Promise<AnswerResult>;
  }

  return request<AnswerResult>('/api/v1/ask', {
    method: 'POST',
    body: JSON.stringify({
      query,
      cropId: opts.cropId,
      regionId: opts.regionId,
      growthStageId: opts.growthStageId,
      language: opts.language ?? 'en',
    }),
  });
}

/** Get a previously generated answer by ID */
export async function getAnswer(id: string): Promise<AnswerResult> {
  return request<AnswerResult>(`/api/v1/answers/${encodeURIComponent(id)}`);
}

/** List available knowledge packs */
export async function listKnowledgePacks(): Promise<KnowledgePack[]> {
  try {
    return await request<KnowledgePack[]>('/api/v1/packs');
  } catch (err) {
    if (err instanceof DeviceOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw err instanceof DeviceOfflineError ? err : new DeviceOfflineError();
    }
    // Fallback to static bundled packs index if remote API is unreachable
    try {
      const BASE_PATH = import.meta.env.BASE_URL || '/';
      const normalizedBase = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;
      const res = await fetch(`${normalizedBase}packs/index.json`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : data.value || [];
      }
    } catch {}
    throw err;
  }
}

/** Get details of a single knowledge pack */
export async function getKnowledgePack(id: string): Promise<KnowledgePack> {
  try {
    return await request<KnowledgePack>(`/api/v1/packs/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof DeviceOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw err instanceof DeviceOfflineError ? err : new DeviceOfflineError();
    }
    const packs = await listKnowledgePacks();
    const found = packs.find((p) => p.id === id);
    if (found) return found;
    throw err;
  }
}

/** Download complete knowledge pack with manifest, sources, and passages for offline use */
export async function downloadKnowledgePackPayload(packId: string): Promise<PackDownloadPayload> {
  try {
    return await request<PackDownloadPayload>(`/api/v1/packs/${encodeURIComponent(packId)}/download`);
  } catch (err) {
    if (err instanceof DeviceOfflineError || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw err instanceof DeviceOfflineError ? err : new DeviceOfflineError();
    }
    // Fallback to static bundled pack payload
    try {
      const BASE_PATH = import.meta.env.BASE_URL || '/';
      const normalizedBase = BASE_PATH.endsWith('/') ? BASE_PATH : `${BASE_PATH}/`;
      const res = await fetch(`${normalizedBase}packs/${encodeURIComponent(packId)}.json`);
      if (res.ok) {
        return (await res.json()) as PackDownloadPayload;
      }
    } catch {}
    throw err;
  }
}

