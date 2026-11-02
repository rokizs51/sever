import type { JdExtraction } from '@/lib/domain/types';
import Chip from '@/components/ui/chip';

interface ChipProps {
  label: string;
  items: string[];
}

function ChipSection({ label, items }: ChipProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-sm font-medium text-mute">{label}:</span>
      {items.map((item, idx) => (
        <Chip key={`${label}-${idx}`}>{item}</Chip>
      ))}
    </div>
  );
}

interface JdChipsProps {
  extraction: JdExtraction;
}

export function JdChips({ extraction }: JdChipsProps) {
  const MAX_CHIPS = 24;

  const sections = [
    { label: 'Required', items: extraction.requiredSkills },
    { label: 'Preferred', items: extraction.preferredSkills },
    { label: 'Tools', items: extraction.tools },
    { label: 'Keywords', items: extraction.keywords },
  ];

  const totalChips = sections.reduce((sum, s) => sum + s.items.length, 0);
  const overflow = Math.max(0, totalChips - MAX_CHIPS);

  // Earlier sections get first claim on the shared cap, same as before.
  let budget = MAX_CHIPS;
  const shown = sections.map((s) => {
    const items = s.items.slice(0, budget);
    budget -= items.length;
    return { label: s.label, items };
  });

  return (
    <div className="space-y-2">
      {shown.map((section) => (
        <ChipSection key={section.label} label={section.label} items={section.items} />
      ))}
      {overflow > 0 && (
        <Chip tone="neutral" className="border border-line">
          +{overflow}
        </Chip>
      )}
    </div>
  );
}
