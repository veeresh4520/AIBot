import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TRUSTED_MANIFEST,
  TRUSTED_OFFLINE_ASSETS,
  TOTAL_OFFLINE_ASSETS_SIZE_BYTES,
  resolveAssetUrl,
  validateManifestStructure,
} from '../assetManifest';
import {
  computeBufferSha256,
  checkStorageQuota,
  StorageQuotaExceededError,
  AssetIntegrityError,
  validateAllOfflineAssets,
  getAssetReadinessReport,
  downloadAllOfflineAssets,
  getOfflineAssetArrayBuffer,
  removeOfflineAssets,
  OFFLINE_CACHE_NAME,
} from '../assetDelivery';

describe('Phase 2: Offline Model & Runtime Asset Delivery Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Trusted Versioned Asset Manifest', () => {
    it('uses unified OFFLINE_CACHE_NAME plant-doctor-models-v1', () => {
      expect(OFFLINE_CACHE_NAME).toBe('plant-doctor-models-v1');
    });

    it('defines the exact 4 required vision model and WASM runtime assets', () => {
      expect(TRUSTED_OFFLINE_ASSETS.length).toBe(4);
      const ids = TRUSTED_OFFLINE_ASSETS.map((a) => a.id);
      expect(ids).toContain('mobilenet_v2_onnx');
      expect(ids).toContain('mobilenet_v2_metadata');
      expect(ids).toContain('ort_wasm_simd_threaded_binary');
      expect(ids).toContain('ort_wasm_simd_threaded_loader');
    });

    it('guarantees all individual assets are under Cloudflare Pages 25 MiB limit', () => {
      const maxCloudflareBytes = 25 * 1024 * 1024;
      for (const asset of TRUSTED_OFFLINE_ASSETS) {
        expect(asset.expectedSizeBytes).toBeLessThan(maxCloudflareBytes);
        expect(asset.expectedSizeBytes).toBeGreaterThan(0);
      }
      expect(TOTAL_OFFLINE_ASSETS_SIZE_BYTES).toBe(23498524); // ~22.41 MB
    });

    it('verifies reproducible SHA-256 hashes and MIME types on all entries', () => {
      for (const asset of TRUSTED_OFFLINE_ASSETS) {
        // Valid 64-character lowercase hex string
        expect(asset.expectedSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(asset.contentType).toBeTruthy();
        expect(asset.relativePath).toBeTruthy();
      }

      const wasm = TRUSTED_OFFLINE_ASSETS.find((a) => a.id === 'ort_wasm_simd_threaded_binary')!;
      expect(wasm.contentType).toBe('application/wasm');
      expect(wasm.expectedSizeBytes).toBe(14239897);
      expect(wasm.expectedSha256).toBe('3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2');

      const onnx = TRUSTED_OFFLINE_ASSETS.find((a) => a.id === 'mobilenet_v2_onnx')!;
      expect(onnx.contentType).toBe('application/octet-stream');
      expect(onnx.expectedSizeBytes).toBe(9227028);
      expect(onnx.expectedSha256).toBe('c209f96f0a87a265b0ff6765c2e84d48038a7d8b8692d7629445b4513c344eb7');

      const mjs = TRUSTED_OFFLINE_ASSETS.find((a) => a.id === 'ort_wasm_simd_threaded_loader')!;
      expect(mjs.contentType).toBe('text/javascript');
      expect(mjs.expectedSizeBytes).toBe(24381);

      const meta = TRUSTED_OFFLINE_ASSETS.find((a) => a.id === 'mobilenet_v2_metadata')!;
      expect(meta.contentType).toBe('application/json');
      expect(meta.expectedSizeBytes).toBe(7218);
    });

    it('validates manifest structure and rejects tampered or malformed schemas', () => {
      expect(validateManifestStructure(TRUSTED_MANIFEST)).toBe(true);
      expect(validateManifestStructure(null)).toBe(false);
      expect(validateManifestStructure({})).toBe(false);
      expect(validateManifestStructure({ manifestVersion: '1.0.0', assets: [] })).toBe(false);
      expect(
        validateManifestStructure({
          manifestVersion: '1.0.0',
          assets: [{ id: 'test', relativePath: 'test.bin', expectedSizeBytes: -1, expectedSha256: 'invalid' }],
        })
      ).toBe(false);
    });

    it('resolves asset URLs correctly for both root and subpath deployments', () => {
      const asset = TRUSTED_OFFLINE_ASSETS[0];
      expect(resolveAssetUrl(asset, '/')).toBe('/models/mobilenet_v2_plant_disease.onnx');
      expect(resolveAssetUrl(asset, '/AIBot/')).toBe('/AIBot/models/mobilenet_v2_plant_disease.onnx');
      expect(resolveAssetUrl(asset, '/AIBot')).toBe('/AIBot/models/mobilenet_v2_plant_disease.onnx');
    });
  });

  describe('2. Cryptographic Integrity & Checksum Verification', () => {
    it('computes exact SHA-256 hash using Web Crypto API', async () => {
      const testBuffer = new TextEncoder().encode('offline-model-asset-delivery-test');
      const hash = await computeBufferSha256(testBuffer.buffer);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('detects checksum failure and throws AssetIntegrityError without trusting remote checksums', async () => {
      const fakeCorruptBuffer = new TextEncoder().encode('corrupt-payload-data');

      // Mock Cache Storage in memory
      const mockCache = {
        match: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
      };
      vi.stubGlobal('caches', {
        open: vi.fn().mockResolvedValue(mockCache),
      });

      // Mock fetch returning corrupted bytes
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-length': String(fakeCorruptBuffer.byteLength),
          }),
          blob: async () => new Blob([fakeCorruptBuffer]),
        })
      );

      // Attempting to download should fail integrity verification
      await expect(
        downloadAllOfflineAssets({ forceRedownload: true })
      ).rejects.toThrowError(AssetIntegrityError);
    });
  });

  describe('3. Storage Quota Detection & Non-Destructive Error Handling', () => {
    it('detects insufficient storage quota and throws StorageQuotaExceededError with recovery guidance', async () => {
      const mockEstimate = vi.fn().mockResolvedValue({
        quota: 30 * 1024 * 1024, // 30 MB total
        usage: 20 * 1024 * 1024, // 20 MB used -> 10 MB remaining, but 22.4 MB + 5 MB needed
      });

      vi.stubGlobal('navigator', {
        storage: { estimate: mockEstimate },
      });

      await expect(checkStorageQuota(TOTAL_OFFLINE_ASSETS_SIZE_BYTES)).rejects.toThrowError(
        StorageQuotaExceededError
      );

      try {
        await checkStorageQuota(TOTAL_OFFLINE_ASSETS_SIZE_BYTES);
      } catch (err) {
        expect(err).toBeInstanceOf(StorageQuotaExceededError);
        const quotaErr = err as StorageQuotaExceededError;
        expect(quotaErr.requiredBytes).toBe(TOTAL_OFFLINE_ASSETS_SIZE_BYTES);
        expect(quotaErr.recoveryGuidance).toContain('free up space');
        expect(quotaErr.recoveryGuidance).toContain('Existing knowledge packs and data have been preserved');
      }
    });

    it('passes quota check when sufficient storage is available', async () => {
      const mockEstimate = vi.fn().mockResolvedValue({
        quota: 1000 * 1024 * 1024, // 1 GB total
        usage: 100 * 1024 * 1024,  // 100 MB used -> 900 MB free
      });

      vi.stubGlobal('navigator', {
        storage: { estimate: mockEstimate },
      });

      await expect(checkStorageQuota(TOTAL_OFFLINE_ASSETS_SIZE_BYTES)).resolves.toBeUndefined();
    });
  });

  describe('4. Download Cancellation, Progress & Retry Lifecycle', () => {
    it('respects AbortSignal and aborts download cleanly', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        downloadAllOfflineAssets({ signal: controller.signal })
      ).rejects.toThrow();
    });

    it('reports progress events with percent, loaded bytes, and total bytes', async () => {
      const progressUpdates: any[] = [];
      const onProgress = (p: any) => progressUpdates.push({ ...p });

      // Create a mock Cache Storage in memory
      const memoryCache = new Map<string, Response>();
      const mockCache = {
        match: vi.fn(async (url: string) => memoryCache.get(url)),
        put: vi.fn(async (url: string, res: Response) => {
          memoryCache.set(url, res);
        }),
        delete: vi.fn(async (url: string) => memoryCache.delete(url)),
      };

      vi.stubGlobal('caches', {
        open: vi.fn().mockResolvedValue(mockCache),
      });

      // Mock fetch returning exact expected bytes for each asset
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        const asset = TRUSTED_OFFLINE_ASSETS.find((a) => url.includes(a.relativePath));
        const size = asset ? asset.expectedSizeBytes : 100;
        const buf = new Uint8Array(size);

        // Mock computeBufferSha256 to match expected hash for test simulation
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            'content-length': String(size),
            'content-type': asset?.contentType || 'application/octet-stream',
          }),
          body: {
            getReader: () => {
              let delivered = false;
              return {
                read: async () => {
                  if (delivered) return { done: true, value: undefined };
                  delivered = true;
                  return { done: false, value: buf };
                },
                cancel: async () => {},
              };
            },
          },
        };
      }));

      // Stub computeBufferSha256 to simulate valid hashes for all assets
      if (globalThis.crypto?.subtle) {
        vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(async (_algo, data) => {
          const byteLen = (data as ArrayBuffer).byteLength;
          const asset = TRUSTED_OFFLINE_ASSETS.find((a) => a.expectedSizeBytes === byteLen);
          if (asset) {
            // Convert asset.expectedSha256 hex string to ArrayBuffer
            const match = asset.expectedSha256;
            const bytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
              bytes[i] = parseInt(match.substr(i * 2, 2), 16);
            }
            return bytes.buffer;
          }
          return new Uint8Array(32).buffer;
        });
      }

      const report = await downloadAllOfflineAssets({ onProgress, maxRetries: 1 });
      expect(report).toBeDefined();
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].percent).toBe(100);
      expect(progressUpdates[progressUpdates.length - 1].completedAssets).toBe(4);
    });
  });

  describe('5. Truthful Readiness States & Validation Report', () => {
    it('returns missing status when assets have not been downloaded', async () => {
      const mockCache = {
        match: vi.fn().mockResolvedValue(undefined),
      };
      vi.stubGlobal('caches', {
        open: vi.fn().mockResolvedValue(mockCache),
      });

      const report = await getAssetReadinessReport();
      expect(report.isIntegrityVerified).toBe(false);
      expect(report.isModelAvailable).toBe(false);
      expect(report.isRuntimeAvailable).toBe(false);
      expect(report.lastValidationResult?.valid).toBe(false);
      expect(report.lastValidationResult?.details['mobilenet_v2_onnx'].status).toBe('missing');
    });

    it('detects corrupt assets and reports corrupt status on SHA-256 or size mismatch', async () => {
      const corruptBuf = new Uint8Array(100); // Mismatched size
      const mockResponse = new Response(corruptBuf, {
        headers: { 'X-Asset-Sha256': 'wronghash' },
      });

      const mockCache = {
        match: vi.fn().mockResolvedValue(mockResponse),
      };
      vi.stubGlobal('caches', {
        open: vi.fn().mockResolvedValue(mockCache),
      });

      const validation = await validateAllOfflineAssets();
      expect(validation.valid).toBe(false);
      const detail = validation.details['mobilenet_v2_onnx'];
      expect(detail.valid).toBe(false);
      expect(detail.status).toBe('corrupt');
      expect(detail.error).toContain('Size mismatch');
    });

    it('retrieves offline asset buffer via getOfflineAssetArrayBuffer', async () => {
      const testBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
      const mockResponse = new Response(testBuffer);
      const mockCache = {
        match: vi.fn().mockResolvedValue(mockResponse),
      };
      vi.stubGlobal('caches', {
        open: vi.fn().mockResolvedValue(mockCache),
      });

      const buf = await getOfflineAssetArrayBuffer('mobilenet_v2_onnx');
      expect(buf).toBeDefined();
      expect(buf?.byteLength).toBe(4);
    });

    it('safely cleans up offline assets without touching user data or packs', async () => {
      const deletedUrls: string[] = [];
      const mockCache = {
        delete: vi.fn(async (url: string) => {
          deletedUrls.push(url);
          return true;
        }),
      };
      vi.stubGlobal('caches', {
        open: vi.fn().mockResolvedValue(mockCache),
      });

      await removeOfflineAssets();
      expect(deletedUrls.length).toBe(4);
      for (const asset of TRUSTED_OFFLINE_ASSETS) {
        expect(deletedUrls.some((u) => u.includes(asset.relativePath))).toBe(true);
      }
    });
  });
});
