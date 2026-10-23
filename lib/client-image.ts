/** Browser-only helpers shared by every "photograph a paper sheet" screen. */

export type Photo = { name: string; dataUrl: string; before: number; after: number };

const LONG_EDGE = 1600;
export const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const dataUrlBytes = (u: string) => Math.floor(((u.length - u.indexOf(",") - 1) * 3) / 4);

/** Downscale on the phone before upload: a 4 MB camera photo becomes ~300 KB at 1600px —
 *  trainers and admissions staff are on mobile data. */
export async function downscale(file: File): Promise<Photo> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, LONG_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  return { name: file.name, dataUrl, before: file.size, after: dataUrlBytes(dataUrl) };
}
