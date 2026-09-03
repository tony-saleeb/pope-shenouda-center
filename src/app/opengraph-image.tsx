import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'دورة التاريخ الكنسي | مركز البابا شنودة للتاريخ الكنسي';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  const logo = await readFile(join(process.cwd(), 'public', 'logo-shenouda.png'));
  const logoSrc = `data:image/png;base64,${Buffer.from(logo).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #1a1208 0%, #3d2105 48%, #130c05 100%)',
          border: '28px solid #d4af6a',
        }}
      >
        <img src={logoSrc} width={520} height={520} alt="" />
      </div>
    ),
    {
      ...size,
    }
  );
}
