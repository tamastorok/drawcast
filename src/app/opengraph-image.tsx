import { readFile } from "fs/promises";
import { join } from "path";

export const alt = process.env.NEXT_PUBLIC_FRAME_NAME || "Drawcast";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  const imageData = await readFile(join(process.cwd(), 'public', 'image.png'));
  return new Response(imageData, {
    headers: { 'Content-Type': 'image/png' }
  });
}
