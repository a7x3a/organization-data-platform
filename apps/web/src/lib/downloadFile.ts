import { filesApi } from '../api/files';
import { apiClient } from '../api/client';
import type { CollectedFile } from '@odp/shared-types';

export async function openFile(fileOrId: Pick<CollectedFile, 'id' | 'fileName' | 'status' | 'sourceUrl'> | string): Promise<void> {
  const id = typeof fileOrId === 'string' ? fileOrId : fileOrId.id;
  const isUploaded = typeof fileOrId === 'string' ? true : fileOrId.status === 'UPLOADED';
  const sourceUrl = typeof fileOrId === 'string' ? undefined : fileOrId.sourceUrl;

  if (isUploaded) {
    try {
      const res = await filesApi.getDownloadUrl(id);
      if (res.url.startsWith('/api/')) {
        const fileRes = await apiClient.get(res.url.slice('/api'.length), {
          responseType: 'blob',
        });
        const blobUrl = URL.createObjectURL(fileRes.data);
        window.open(blobUrl, '_blank');
        return;
      }
      window.open(res.url, '_blank');
      return;
    } catch {
      // Fallback
    }
  }

  if (sourceUrl) {
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  }
}

export async function downloadFile(fileOrId: Pick<CollectedFile, 'id' | 'fileName'> | string): Promise<void> {
  const id = typeof fileOrId === 'string' ? fileOrId : fileOrId.id;
  const fileName = typeof fileOrId === 'string' ? undefined : fileOrId.fileName;

  try {
    const res = await filesApi.getDownloadUrl(id);
    if (res.url.startsWith('/api/')) {
      const fileRes = await apiClient.get(res.url.slice('/api'.length), {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(fileRes.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } else {
      window.open(res.url, '_blank');
    }
  } catch (err: any) {
    alert(err?.response?.data?.message || 'Could not download file');
  }
}
