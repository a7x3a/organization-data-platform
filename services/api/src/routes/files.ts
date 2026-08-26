import fs from 'fs';
import path from 'path';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireCollector, requireDataManager } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  idParamSchema,
  listFilesQuerySchema,
  manualUploadBodySchema,
  manualEntrySchema,
  updateFileSchema,
  approveRejectFileSchema,
  bulkFileApprovalSchema,
  runFilesApprovalSchema,
  bulkDeleteFilesSchema,
  pruneRunFilesSchema,
} from '../schemas/index';
import * as fileService from '../services/file.service';
import { storageProvider, LocalStorageProvider } from '../services/storage';

function getEffectiveMimeType(fileName: string, mimeType?: string | null): string {
  if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.json': return 'application/json; charset=utf-8';
    case '.jsonl': return 'application/x-ndjson; charset=utf-8';
    case '.pdf': return 'application/pdf';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.md': return 'text/markdown; charset=utf-8';
    case '.csv': return 'text/csv; charset=utf-8';
    case '.epub': return 'application/epub+zip';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.mp3': return 'audio/mpeg';
    case '.mp4': return 'video/mp4';
    default: return mimeType || 'application/octet-stream';
  }
}

const router = Router();

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB, matches scraper's default cap
});

// POST /api/files/manual-upload — Collector+. A human uploads a file
// directly; goes through the same hash/dedupe/store pipeline the scraper uses.
router.post(
  '/manual-upload',
  requireCollector,
  upload.single('file'),
  validate(manualUploadBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'No file provided', 'FILE_REQUIRED');
      }

      let metadata: Record<string, unknown> | undefined;
      if (req.body.metadata) {
        try {
          metadata = JSON.parse(req.body.metadata);
        } catch {
          throw new AppError(400, 'metadata must be valid JSON', 'INVALID_METADATA');
        }
      }

      const file = await fileService.createManualUpload({
        sourceId: req.body.sourceId,
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype || null,
        uploadedByUserId: req.user!.sub,
        metadata,
      });
      res.status(201).json(file);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/manual-entry — Collector+. Catalog a document's metadata
// without attaching a file yet.
router.post(
  '/manual-entry',
  requireCollector,
  validate(manualEntrySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.createManualEntry({
        ...req.body,
        uploadedByUserId: req.user!.sub,
      });
      res.status(201).json(file);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/sync — Trigger storage directory synchronization
router.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await fileService.syncStorageDirectories();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/files
router.get(
  '/',
  validate(listFilesQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.listFiles(req.query as Record<string, string>);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/files/:id
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.getFileById(req.params.id);
      res.json(file);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/files/:id/download — Direct file download attachment
router.get(
  '/:id/download',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.getFileById(req.params.id);
      if (!file.r2Key) {
        throw new AppError(404, 'File not uploaded or missing key', 'FILE_NOT_FOUND');
      }

      if (storageProvider instanceof LocalStorageProvider) {
        let filePath = storageProvider.resolvePath(file.r2Key);
        if (!fs.existsSync(filePath)) {
          const cleanKey = file.r2Key.replace(/^[/\\]+/, '');
          const altPath = storageProvider.resolvePath(cleanKey);
          if (fs.existsSync(altPath)) {
            filePath = altPath;
          }
        }

        const effectiveName = file.fileName || path.basename(filePath);
        const effectiveMime = getEffectiveMimeType(effectiveName, file.mimeType);

        res.setHeader('Content-Type', effectiveMime);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
        return res.download(filePath, effectiveName, (err) => {
          if (err && !res.headersSent) {
            next(new AppError(404, 'File not found on local storage', 'FILE_NOT_FOUND'));
          }
        });
      }

      const { url } = await storageProvider.getSignedUrl(file.r2Key);
      return res.redirect(url);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/files/:id/content — Serves file inline (view PDF/media/JSON directly in browser)
router.get(
  '/:id/content',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.getFileById(req.params.id);
      if (!file.r2Key) {
        throw new AppError(404, 'File not uploaded or missing key', 'FILE_NOT_FOUND');
      }

      if (storageProvider instanceof LocalStorageProvider) {
        let filePath = storageProvider.resolvePath(file.r2Key);
        if (!fs.existsSync(filePath)) {
          const cleanKey = file.r2Key.replace(/^[/\\]+/, '');
          const altPath = storageProvider.resolvePath(cleanKey);
          if (fs.existsSync(altPath)) {
            filePath = altPath;
          }
        }

        const effectiveName = file.fileName || path.basename(filePath);
        const effectiveMime = getEffectiveMimeType(effectiveName, file.mimeType);

        res.setHeader('Content-Type', effectiveMime);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(effectiveName)}"`
        );
        return res.sendFile(filePath, (err) => {
          if (err && !res.headersSent) {
            next(new AppError(404, 'File not found on local storage', 'FILE_NOT_FOUND'));
          }
        });
      }

      const { url } = await storageProvider.getSignedUrl(file.r2Key);
      return res.redirect(url);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/files/:id/json — Fetch parsed JSON content for structured previewing
router.get(
  '/:id/json',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.getFileById(req.params.id);
      let buf: Buffer | null = null;
      if (file.r2Key) {
        try {
          buf = await storageProvider.getBuffer(file.r2Key);
        } catch {
          buf = null;
        }
      }

      if (!buf) {
        // Return structured file metadata as rich fallback
        const metadataObj = (file.metadata && typeof file.metadata === 'object' && Object.keys(file.metadata).length > 0)
          ? file.metadata
          : {
              fileId: file.fileId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              fileSize: file.fileSize ? Number(file.fileSize) : null,
              sha256: file.sha256,
              status: file.status,
              r2Key: file.r2Key,
              sourceUrl: file.sourceUrl,
              approvalStatus: file.approvalStatus,
              createdAt: file.createdAt,
            };

        return res.json({
          fileId: file.id,
          fileName: file.fileName,
          r2Key: file.r2Key,
          isJson: true,
          data: metadataObj,
        });
      }

      const rawText = buf.toString('utf-8');
      try {
        const parsed = JSON.parse(rawText);
        return res.json({
          fileId: file.id,
          fileName: file.fileName,
          r2Key: file.r2Key,
          isJson: true,
          data: parsed,
        });
      } catch {
        return res.json({
          fileId: file.id,
          fileName: file.fileName,
          r2Key: file.r2Key,
          isJson: false,
          raw: rawText,
        });
      }
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/files/local-storage/* — serves local files by key
router.get('/local-storage/*', (req: Request, res: Response, next: NextFunction) => {
  if (!(storageProvider instanceof LocalStorageProvider)) {
    next(new AppError(404, 'Local storage is not active', 'LOCAL_STORAGE_INACTIVE'));
    return;
  }
  try {
    const rawKey = req.params[0] || req.path.replace(/^\/local-storage\//, '');
    const filePath = storageProvider.resolvePath(decodeURIComponent(rawKey));
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        next(new AppError(404, 'File not found on local storage', 'FILE_NOT_FOUND'));
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/files/:id/download-url
router.get(
  '/:id/download-url',
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.getFileDownloadUrl(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/files/:id — Data Manager+. Metadata only (fileName/metadata) —
// never sha256/r2Key/status, which are collection-integrity facts.
router.patch(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  validate(updateFileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.updateFile(req.params.id, req.body);
      res.json(file);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/files/:id — Data Manager+. Hard delete: removes the DB record
// AND the underlying stored object, for a file of any origin. A deliberate
// exception to this platform's "00_raw is immutable" default — see
// file.service.ts's deleteFile for why.
router.delete(
  '/:id',
  requireDataManager,
  validate(idParamSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fileService.deleteFile(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/:id/approve — Approve a single file
router.post(
  '/:id/approve',
  validate(idParamSchema, 'params'),
  validate(approveRejectFileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.approveFile(req.params.id, req.user!.sub, req.body.notes);
      res.json(file);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/:id/reject — Decline/reject a single file
router.post(
  '/:id/reject',
  validate(idParamSchema, 'params'),
  validate(approveRejectFileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await fileService.rejectFile(req.params.id, req.user!.sub, req.body.notes);
      res.json(file);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/bulk-approve — Bulk approve multiple files
router.post(
  '/bulk-approve',
  validate(bulkFileApprovalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.bulkApproveFiles(req.body.fileIds, req.user!.sub, req.body.notes);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/bulk-reject — Bulk decline/reject multiple files
router.post(
  '/bulk-reject',
  validate(bulkFileApprovalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.bulkRejectFiles(req.body.fileIds, req.user!.sub, req.body.notes);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/run/:runId/approve-all — Approve all files for a collection run
router.post(
  '/run/:runId/approve-all',
  validate(runFilesApprovalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.approveRunFiles(req.params.runId, req.user!.sub, req.body.notes);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/run/:runId/reject-all — Decline/reject all files for a collection run
router.post(
  '/run/:runId/reject-all',
  validate(runFilesApprovalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.rejectRunFiles(req.params.runId, req.user!.sub, req.body.notes);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/bulk-delete — Bulk delete multiple files (Data Manager+)
router.post(
  '/bulk-delete',
  requireDataManager,
  validate(bulkDeleteFilesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.bulkDeleteFiles(req.body.fileIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/files/run/:runId/prune — Prune non-matching files from a run (e.g. keep only PDF) (Data Manager+)
router.post(
  '/run/:runId/prune',
  requireDataManager,
  validate(pruneRunFilesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fileService.pruneRunFiles(req.params.runId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
