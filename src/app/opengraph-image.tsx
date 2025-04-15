export const alt = process.env.NEXT_PUBLIC_FRAME_NAME || "Drawcast";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

// Use existing image.png from public directory
export default function Image() {
  return fetch(new URL("../../public/image.png", import.meta.url));
}
