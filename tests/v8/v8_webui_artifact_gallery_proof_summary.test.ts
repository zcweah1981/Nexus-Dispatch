import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const artifactGallerySource = readFileSync(
  join(__dirname, '../../src/webui/src/components/ArtifactGallery.tsx'),
  'utf8',
);

const FORBIDDEN_VISIBLE_PROOF_TOKENS = [
  'project_id',
  'dispatch_id',
  'run_id',
  'trace_id',
  'worker_run_id',
  'payload_json',
  'raw_proof',
  'proof_json',
  'secret',
  'chat_id',
  'bot_token',
  'JSON.stringify(art.payload',
  'art.payload.substring',
];

describe('WebUI ArtifactGallery proof summary contract', () => {
  it('ArtifactGallery is explicitly marked as a V8 proof-summary-only display', () => {
    expect(artifactGallerySource).toContain('V8_ARTIFACT_GALLERY_PROOF_SUMMARY_CONTRACT');
    expect(artifactGallerySource).toContain('Proof 摘要');
    expect(artifactGallerySource).toContain('Complete evidence stays in Runtime DB/artifacts');
  });

  it('ArtifactGallery renders a sanitized proof summary instead of raw payload JSON', () => {
    expect(artifactGallerySource).toContain('getProofSummary');
    expect(artifactGallerySource).toContain('proof_summary');
    expect(artifactGallerySource).toContain('summary');
    expect(artifactGallerySource).toContain('result');
    for (const forbidden of FORBIDDEN_VISIBLE_PROOF_TOKENS) {
      expect(artifactGallerySource).not.toContain(forbidden);
    }
  });

  it('ArtifactGallery keeps raw proof identifiers out of visible card header/details', () => {
    expect(artifactGallerySource).not.toContain('truncateHash');
    expect(artifactGallerySource).not.toContain('{art.task_id || art.run_id}');
    expect(artifactGallerySource).toContain('getVisibleArtifactTitle');
    expect(artifactGallerySource).toContain('Proof 已存系统');
  });
});
