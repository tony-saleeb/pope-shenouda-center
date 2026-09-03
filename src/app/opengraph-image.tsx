import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'مركز البابا شنودة للتاريخ الكنسي';
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
          background: '#1a1208',
        }}
      >
        <img
          src={logoSrc}
          width={420}
          height={420}
          style={{ objectFit: 'contain' }}
          alt=""
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
