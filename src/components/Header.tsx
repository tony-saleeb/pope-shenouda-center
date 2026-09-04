import Image from 'next/image';

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-logo">
          <Image
            src="/logo-shenouda.png"
            alt="مركز البابا شنودة للتاريخ الكنسي بكنائس وسط القاهرة"
            width={70}
            height={70}
            className="site-header-img is-tall"
            priority
          />
        </div>

        <div className="site-header-logo">
          <Image
            src="/logo-aristotle.webp"
            alt="أكاديمية أرسطو"
            width={90}
            height={60}
            className="site-header-img"
            priority
          />
        </div>

        <div className="site-header-logo">
          <Image
            src="/logo-coptic.webp"
            alt="المعهد العالي للدراسات القبطية"
            width={75}
            height={75}
            className="site-header-img is-tall"
            priority
          />
        </div>

        <div className="site-header-logo">
          <Image
            src="/logo-cultural.webp"
            alt="المركز الثقافي القبطي الأرثوذكسي"
            width={75}
            height={75}
            className="site-header-img is-tall"
            priority
          />
        </div>
      </div>
    </header>
  );
}
