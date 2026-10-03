import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-autofocus], input, textarea')?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="modal" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-panel">
        <div className="modal-heading">
          <div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
