import { useEffect, useState } from 'react';

export default function FloatingCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <a
      href="/#tarif-standard"
      aria-label="Joy band qilish"
      className={`js-goto-standard hidden lg:block fixed bottom-6 right-6 z-50 transition-all duration-300 hover:scale-105 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6 pointer-events-none'
      }`}
      style={{ width: 96, height: 96 }}
    >
      <img
        src="/ai-fest-logo.svg"
        alt="AI FEST"
        className="cta-pulse w-full h-full block rounded-full shadow-2xl"
      />
    </a>
  );
}
