import Image from 'next/image';

export default function Header() {
  return (
    <header style={{
      width: '100%',
      padding: '1.25rem 1rem 0.5rem',
      background: 'transparent',
      position: 'relative',
      zIndex: 10,
    }}>
      <div style={{
        maxWidth: '36rem',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        {/* Logo 1: Pope Shenouda Center (Left) */}
        <div style={{ flex: '1', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/logo-shenouda.png"
            alt="مركز البابا شنودة للتاريخ الكنسي بكنائس وسط القاهرة"
            width={70}
            height={70}
            style={{
              objectFit: 'contain',
              maxWidth: '100%',
              width: 'auto',
              height: 'auto',
              maxHeight: '4.5rem',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
            }}
            priority
          />
        </div>

        {/* Logo 2: Aristotle Academy (Center-Left) */}
        <div style={{ flex: '1', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/logo-aristotle.webp"
            alt="أكاديمية أرسطو"
            width={90}
            height={60}
            style={{
              objectFit: 'contain',
              maxWidth: '100%',
              width: 'auto',
              height: 'auto',
              maxHeight: '3.75rem',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
            }}
            priority
          />
        </div>

        {/* Logo 3: Coptic Institute (Center-Right) */}
        <div style={{ flex: '1', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/logo-coptic.webp"
            alt="المعهد العالي للدراسات القبطية"
            width={75}
            height={75}
            style={{
              objectFit: 'contain',
              maxWidth: '100%',
              width: 'auto',
              height: 'auto',
              maxHeight: '4.5rem',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
            }}
            priority
          />
        </div>

        {/* Logo 4: Cultural Center (Right) */}
        <div style={{ flex: '1', display: 'flex', justifyContent: 'center' }}>
          <Image
            src="/logo-cultural.webp"
            alt="المركز الثقافي القبطي الأرثوذكسي"
            width={75}
            height={75}
            style={{
              objectFit: 'contain',
              maxWidth: '100%',
              width: 'auto',
              height: 'auto',
              maxHeight: '4.5rem',
              filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
            }}
            priority
          />
        </div>
      </div>
    </header>
  );
}
