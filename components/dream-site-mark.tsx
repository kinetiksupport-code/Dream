export function DreamSiteMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="20" fill="#2F4BFF" />
      <ellipse cx="20" cy="20" rx="14" ry="7" transform="rotate(-30 20 20)" stroke="#C8F560" strokeWidth="3" />
      <circle cx="20" cy="20" r="4" fill="#C8F560" />
      <circle cx="30" cy="12" r="3" fill="#FFFFFF" />
    </svg>
  );
}
