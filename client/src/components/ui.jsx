import { useEffect, useRef, useState } from 'react';
import { Crown, Eye, PencilLine, X } from 'lucide-react';

export function Avatar({ user, size = 26 }) {
  const initials = (user?.name ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="avatar" title={user?.name} style={{ width: size, height: size, background: user?.color ?? '#6b7280', fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

const ROLE_META = {
  owner: { label: 'Owner', icon: Crown },
  editor: { label: 'Can edit', icon: PencilLine },
  viewer: { label: 'View only', icon: Eye },
};

export function RoleBadge({ role }) {
  const meta = ROLE_META[role];
  if (!meta) return null;
  const Icon = meta.icon;
  return <span className={`badge badge-${role}`}><Icon size={11} strokeWidth={2.2} />{meta.label}</span>;
}

export function Modal({ title, subtitle, onClose, children, width = 460 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

// Small dropdown menu anchored to a trigger button.
export function Menu({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={`menu menu-${align}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: Icon, children, danger, ...props }) {
  return (
    <button className={`menu-item${danger ? ' danger' : ''}`} role="menuitem" {...props}>
      {Icon && <Icon size={14} />}
      <span>{children}</span>
    </button>
  );
}

export function timeAgo(iso) {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return Math.abs(value) < 45 && unit === 'second' ? 'just now' : rtf.format(Math.round(value), unit);
    value /= size;
  }
  return '';
}
