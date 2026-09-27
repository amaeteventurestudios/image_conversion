export function Logo({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <circle cx="11.5" cy="11" r="3" fill="#fff" />
      <path d="M5 25l7-8 5 5 4-4 6 7H5z" fill="#fff" />
    </svg>
  );
}
