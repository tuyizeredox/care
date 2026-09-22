'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Edit and delete icon buttons for a row in an admin list. */
export function RowActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 justify-end gap-0.5">
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={'Edit ' + label}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={'Delete ' + label}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
      </Button>
    </div>
  );
}
