import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-content">
      <div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button></div>
      {children}
    </div>
  </dialog>
}
