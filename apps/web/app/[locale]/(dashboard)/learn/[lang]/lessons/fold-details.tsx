'use client';

import { useState, type ReactNode } from 'react';

/**
 * A fold the learner opens and closes. The server only says where it starts:
 * open while one of its boxes is checked. Unticking the last box renders that
 * as false, and a server `open` would close the fold under the pointer. A box
 * checked from elsewhere (Back, a link) still opens it.
 */
export function FoldDetails({
  checked,
  className,
  children,
}: {
  checked: boolean;
  className: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(checked);
  // Adjusted while rendering, not in an effect: React's way to follow a prop.
  const [wasChecked, setWasChecked] = useState(checked);
  if (checked !== wasChecked) {
    setWasChecked(checked);
    if (checked) setOpen(true);
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={className}
    >
      {children}
    </details>
  );
}
