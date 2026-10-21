// Hoa văn SVG đơn giản lấy cảm hứng từ hoa dạ lan (lan nở đêm); không dùng ảnh ngoài.

export function OrchidMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <path d="M32 12c6.5 7.5 6.5 16 0 24-6.5-8-6.5-16.5 0-24z" />
      <path d="M32 36c-9.5 1-16-3-19-11 8.5-1 15 3 19 11z" />
      <path d="M32 36c9.5 1 16-3 19-11-8.5-1-15 3-19 11z" />
      <path d="M32 36v16M24 52h16" />
    </svg>
  );
}

/** Đường viền trang trí kiểu hồi văn, dùng làm vạch chia giữa các phần. */
export function Divider({ className = '' }: { className?: string }) {
  return (
    <div className={`rule-ornament ${className}`} aria-hidden="true">
      <svg
        viewBox="0 0 40 16"
        className="h-4 w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M2 8h8l4-5 6 10 6-10 4 5h8" />
        <circle cx="20" cy="8" r="1.8" fill="currentColor" />
      </svg>
    </div>
  );
}

/** Vòng hoa văn lớn cho hero. */
export function HeroRosette({ className = '' }: { className?: string }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="100" cy="100" r="92" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="84" strokeWidth="0.5" strokeDasharray="2 4" />
      {petals.map((deg) => (
        <path
          key={deg}
          d="M100 100c8-18 8-40 0-62-8 22-8 44 0 62z"
          strokeWidth="1"
          transform={`rotate(${deg} 100 100)`}
        />
      ))}
      <circle cx="100" cy="100" r="10" strokeWidth="1" />
    </svg>
  );
}
