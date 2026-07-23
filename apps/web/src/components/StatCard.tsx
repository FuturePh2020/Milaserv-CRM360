type Tone = "default" | "success" | "amber" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  default: "text-navy",
  success: "text-success",
  amber: "text-amber",
  danger: "text-danger",
};

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-slate">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${TONE_CLASSES[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-slate">{hint}</p>}
    </div>
  );
}
