/**
 * Trusted, versioned asset manifest for offline botanical vision model and WASM runtime.
 * Checksums and sizes are derived reproducibly from trusted build inputs.
 * Checksums supplied by remote servers or downloaded payloads are NEVER trusted.
 */

export interface AssetEntry {
  /** Unique stable asset identifier */
  id: string;
  /** Relative path from app base URL */
  relativePath: string;
  /** Exact expected size in bytes */
  expectedSizeBytes: number;
  /** Expected SHA-256 checksum in lowercase hexadecimal */
  expectedSha256: string;
  /** Correct MIME content-type required for offline execution */
  contentType: string;
  /** Asset functional category */
  category: 'model' | 'runtime';
  /** Whether the asset is mandatory for on-device inference */
  required: boolean;
  /** Human-readable description */
  description: string;
}

export interface TrustedManifest {
  manifestVersion: string;
  modelVersion: string;
  runtimeVersion: string;
  createdAt: string;
  assets: AssetEntry[];
}

/**
 * Verified offline assets for MobileNetV2 Plant Disease Classifier + onnxruntime-web WASM runtime.
 * All files are guaranteed under Cloudflare Pages' 25 MiB per-file limit.
 */
export const TRUSTED_OFFLINE_ASSETS: readonly AssetEntry[] = [
  {
    id: 'mobilenet_v2_onnx',
    relativePath: 'models/mobilenet_v2_plant_disease.onnx',
    expectedSizeBytes: 9227028,
    expectedSha256: 'c209f96f0a87a265b0ff6765c2e84d48038a7d8b8692d7629445b4513c344eb7',
    contentType: 'application/octet-stream',
    category: 'model',
    required: true,
    description: 'MobileNetV2 Plant Disease ONNX Model (38 botanical classes, float32)',
  },
  {
    id: 'mobilenet_v2_metadata',
    relativePath: 'models/model_metadata.json',
    expectedSizeBytes: 7218,
    expectedSha256: '38584a0ba46b7a81b72546a11d5dd6b69a6f966f3db7482b2090349197daf1ea',
    contentType: 'application/json',
    category: 'model',
    required: true,
    description: 'Botanical taxonomy, normalization parameters, and confidence calibration metadata',
  },
  {
    id: 'ort_wasm_simd_threaded_binary',
    relativePath: 'ort/ort-wasm-simd-threaded.wasm',
    expectedSizeBytes: 14239897,
    expectedSha256: '3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2',
    contentType: 'application/wasm',
    category: 'runtime',
    required: true,
    description: 'onnxruntime-web SIMD WebAssembly CPU inference runtime',
  },
  {
    id: 'ort_wasm_simd_threaded_loader',
    relativePath: 'ort/ort-wasm-simd-threaded.mjs',
    expectedSizeBytes: 24381,
    expectedSha256: 'e13f7f94fc51b4ca72b12faeb1ee95f4ace6dfbc8939bc718aabdc0a27c4299b',
    contentType: 'text/javascript',
    category: 'runtime',
    required: true,
    description: 'onnxruntime-web WebAssembly glue/module loader',
  },
] as const;

export const TRUSTED_MANIFEST: TrustedManifest = {
  manifestVersion: '2.0.0',
  modelVersion: '1.0.0',
  runtimeVersion: '1.30.0',
  createdAt: '2026-10-16T18:00:00Z',
  assets: [...TRUSTED_OFFLINE_ASSETS],
};

/** Total size in bytes of all required offline assets (~22.41 MB) */
export const TOTAL_OFFLINE_ASSETS_SIZE_BYTES = TRUSTED_OFFLINE_ASSETS.reduce(
  (acc, a) => acc + a.expectedSizeBytes,
  0
);

/**
 * Resolves full URL for an asset entry given Vite's base path.
 */
export function resolveAssetUrl(asset: AssetEntry, baseUrl?: string): string {
  const base = baseUrl || import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = asset.relativePath.startsWith('/') ? asset.relativePath.slice(1) : asset.relativePath;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Validates the structure and cryptographic format of a manifest.
 */
export function validateManifestStructure(manifest: unknown): manifest is TrustedManifest {
  if (!manifest || typeof manifest !== 'object') return false;
  const m = manifest as Record<string, unknown>;
  if (typeof m.manifestVersion !== 'string' || !m.manifestVersion) return false;
  if (!Array.isArray(m.assets) || m.assets.length === 0) return false;

  for (const item of m.assets) {
    if (!item || typeof item !== 'object') return false;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== 'string' || !a.id) return false;
    if (typeof a.relativePath !== 'string' || !a.relativePath) return false;
    if (typeof a.expectedSizeBytes !== 'number' || a.expectedSizeBytes <= 0) return false;
    if (typeof a.expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(a.expectedSha256)) return false;
    if (typeof a.contentType !== 'string' || !a.contentType) return false;
    if (a.category !== 'model' && a.category !== 'runtime') return false;
    if (typeof a.required !== 'boolean') return false;
  }
  return true;
}
