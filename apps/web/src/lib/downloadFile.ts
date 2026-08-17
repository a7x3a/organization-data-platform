import { filesApi } from '../api/files';
import { apiClient } from '../api/client';

// Shared by Files.tsx and DataBrowser.tsx — both need to turn a file ID into
// an actual browser download/open, and the local-storage-vs-R2 URL handling
// (see comment below) is the same either way.
export async function downloadFile(fileId: string): Promise<void> {
  const res = await filesApi.getDownloadUrl(fileId);
  if (res.url.startsWith('/api/')) {
    // Local storage: this is our own auth-gated route, not a presigned
    // link — plain browser navigation (window.open) never attaches the
    // Authorization header, so it 401s. Fetch it through the authenticated
    // client instead and open the resulting blob.
    const fileRes = await apiClient.get(res.url.slice('/api'.length), {
      responseType: 'blob',
    });
    window.open(URL.createObjectURL(fileRes.data), '_blank');
  } else {
    // R2 presigned URL — auth is already baked into the query string.
    window.open(res.url, '_blank');
  }
}
