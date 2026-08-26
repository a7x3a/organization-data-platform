import { filesApi } from '../api/files';
import { apiClient } from '../api/client';
import type { CollectedFile } from '@odp/shared-types';

export async function openFile(fileOrId: Pick<CollectedFile, 'id' | 'fileName' | 'status' | 'sourceUrl'> | string): Promise<void> {
  const id = typeof fileOrId === 'string' ? fileOrId : fileOrId.id;
  const isUploaded = typeof fileOrId === 'string' ? true : fileOrId.status === 'UPLOADED';
  const sourceUrl = typeof fileOrId === 'string' ? undefined : fileOrId.sourceUrl;

  if (isUploaded) {
    try {
      // First try the authenticated inline content endpoint
      const response = await apiClient.get(`/files/${id}/content`, {
        responseType: 'blob',
      });
      const contentType = String(response.headers['content-type'] || 'application/octet-stream');
      const blob = new Blob([response.data], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      return;
    } catch {
      // Fallback to getDownloadUrl
      try {
        const res = await filesApi.getDownloadUrl(id);
        if (res.url.startsWith('/api/')) {
          const fileRes = await apiClient.get(res.url.slice('/api'.length), {
            responseType: 'blob',
          });
          const blobUrl = URL.createObjectURL(fileRes.data);
          window.open(blobUrl, '_blank');
          setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
          return;
        }
        window.open(res.url, '_blank');
        return;
      } catch {
        // Fall through to sourceUrl
      }
    }
  }

  if (sourceUrl) {
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  }
}

export async function downloadFile(fileOrId: Pick<CollectedFile, 'id' | 'fileName'> | string): Promise<void> {
  const id = typeof fileOrId === 'string' ? fileOrId : fileOrId.id;
  const preferredName = typeof fileOrId === 'string' ? undefined : fileOrId.fileName;

  try {
    // 1. Direct authenticated binary download endpoint
    const response = await apiClient.get(`/files/${id}/download`, {
      responseType: 'blob',
    });

    let filename = preferredName;
    const disposition = response.headers['content-disposition'];
    if (!filename && disposition) {
      const match = /filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i.exec(disposition);
      if (match && match[1]) {
        filename = decodeURIComponent(match[1]);
      }
    }

    const contentType = String(response.headers['content-type'] || 'application/octet-stream');
    const blob = new Blob([response.data], {
      type: contentType,
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'downloaded_file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  } catch (err: any) {
    // 2. Fallback: signed download URL endpoint
    try {
      const res = await filesApi.getDownloadUrl(id);
      if (res.url.startsWith('/api/')) {
        const fileRes = await apiClient.get(res.url.slice('/api'.length), {
          responseType: 'blob',
        });
        const blobUrl = URL.createObjectURL(fileRes.data);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = preferredName || 'downloaded_file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      } else {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = preferredName || 'downloaded_file';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (fallbackErr: any) {
      alert(fallbackErr?.response?.data?.message || err?.response?.data?.message || 'Could not download file');
    }
  }
}
