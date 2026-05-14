type UserHandleTextProps = {
  handle?: string | null;
  className?: string;
  compact?: boolean;
};

function normalizeHandle(handle?: string | null): string {
  const value = String(handle || "").trim();
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

export function UserHandleText({
  handle,
  className = "",
  compact = false,
}: UserHandleTextProps) {
  const value = normalizeHandle(handle);
  if (!value) return null;

  return (
    <div
      className={
        compact
          ? `text-xs opacity-70 ${className}`.trim()
          : `text-sm opacity-80 ${className}`.trim()
      }
    >
      {value}
    </div>
  );
}

export default UserHandleText;
