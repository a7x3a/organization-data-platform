import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { requireCollector } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  idParamSchema,
  listFilesQuerySchema,
  manualUploadBodySchema,
  manualEntrySchema,
} from '../schemas/index';
import * as fileService from '../services/file.service';
import { storageProvider, LocalStorageProvider } from '../services/storage';

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

// GET /api/files/local-storage/:key — serves files when STORAGE_PROVIDER=local.
// Auth-gated (router-level requireAuth); local mode has no cryptographic
// signing, so access control comes entirely from this route requiring login.
router.get('/local-storage/:key', (req: Request, res: Response, next: NextFunction) => {
  if (!(storageProvider instanceof LocalStorageProvider)) {
    next(new AppError(404, 'Local storage is not active', 'LOCAL_STORAGE_INACTIVE'));
    return;
  }
  try {
    // Express already percent-decodes route params, and the key was
    // encodeURIComponent'd as a single opaque segment (slashes -> %2F) when
    // the signed URL was generated — no further decoding needed here.
    const filePath = storageProvider.resolvePath(req.params.key);
    res.sendFile(filePath, (err) => {
      if (err) next(new AppError(404, 'File not found on local storage', 'FILE_NOT_FOUND'));
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

export default router;
