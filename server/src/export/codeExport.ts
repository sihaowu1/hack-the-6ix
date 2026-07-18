import type { Response } from 'express';
import archiver from 'archiver';
import { slugify } from '../utils/fsx';
import { exportReadme, viewerHtml, viewerJs } from './exportTemplates';

export interface CodeExportOptions {
  code: string;
  blenderCode?: string;
  title?: string;
}

/**
 * Streams a ZIP of the generated project as code: the scene module, a
 * standalone Three.js viewer, the Blender script, and a README.
 */
export function streamProjectZip(res: Response, options: CodeExportOptions): void {
  const title = options.title?.trim() || 'MotionForge scene';
  const slug = slugify(title);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.destroy(err));
  archive.pipe(res);

  archive.append(options.code, { name: 'scene.module.js' });
  archive.append(viewerHtml(title), { name: 'index.html' });
  archive.append(viewerJs(), { name: 'viewer.js' });
  if (options.blenderCode?.trim()) {
    archive.append(options.blenderCode, { name: 'scene.blender.py' });
  }
  archive.append(exportReadme(title), { name: 'README.md' });
  void archive.finalize();
}
