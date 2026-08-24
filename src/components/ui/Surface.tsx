import type { ElementType, HTMLAttributes, ReactNode } from 'react';

type SurfaceVariant = 'default' | 'raised' | 'subtle';

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  /**
   * default — everyday content panel. Bordered, flat.
   * raised  — interactive card; lifts on hover/focus.
   * subtle  — nested/inset block inside another panel.
   */
  variant?: SurfaceVariant;
  /** Render as a different element (`section`, `article`, `aside`, …). */
  as?: ElementType;
  children?: ReactNode;
}

const variants: Record<SurfaceVariant, string> = {
  default: 'surface',
  raised: 'surface-raised',
  subtle: 'surface-subtle',
};

/**
 * The single shared panel primitive for "Kanwil Command".
 *
 * Encodes background + border + radius + elevation in one place. Three
 * variants, deliberately — the audit found the app bypassing `.soft-panel`
 * nine times with hand-written `bg-white … rounded-2xl border … shadow-sm`
 * recipes, which is what made the skeleton visually mismatch the real card
 * it stands in for.
 *
 * Padding is NOT baked in: panels legitimately need edge-to-edge content
 * (tables, list headers with their own dividers), so callers pass `p-*`.
 *
 * Phase 2B only proves the primitive works. Migrating the remaining call
 * sites happens page-by-page in later phases, so each migration stays
 * reviewable.
 */
export function Surface({
  variant = 'default',
  as: Tag = 'div',
  className = '',
  children,
  ...props
}: SurfaceProps) {
  return (
    <Tag className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
