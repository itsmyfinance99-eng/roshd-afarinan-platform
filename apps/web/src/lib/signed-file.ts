/** Where the API serves a private file to the holder of a signed, expiring address. */
const SIGNED_FILE = /^\/api\/v1\/files\/[A-Za-z0-9-]+\/content\?/;

/** Whether `url` is a signed address of a file of this site, as the API hands them out. */
export const isSignedFileUrl = (url: unknown): url is string =>
  typeof url === 'string' && SIGNED_FILE.test(url);

export const BAD_FILE_ADDRESS_FA = 'نشانی دریافت فایل معتبر نیست. دوباره تلاش کنید.';

/**
 * Lets the browser save a file from its signed address. The file is sent as an attachment, so
 * the page stays where it is. Only an address of the files of this site is followed: whatever
 * else a response carries is never navigated to. Returns whether the download was started.
 */
export function saveSignedFile(url: unknown): boolean {
  if (!isSignedFileUrl(url)) return false;
  window.location.assign(url);
  return true;
}
