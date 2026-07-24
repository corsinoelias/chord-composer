import { useEffect, useRef, useState } from 'react'
import { v } from '../../lib/bassTab/theme'

/**
 * Menú desplegable del transporte.
 *
 * Existe porque el transporte acumula trece acciones de importar y exportar, y
 * en fila plana convierten la barra en un muro de iconos sin etiqueta — hoy la
 * única pista de qué hace cada uno es el `title`, que exige parar y apuntar con
 * el ratón. Agrupadas bajo "Import" y "Export" recuperan su nombre.
 *
 * Se abre hacia arriba (`bottom: 100%`) porque el transporte vive pegado al
 * borde inferior de la ventana.
 */

export interface MenuItem {
  label: string
  onClick: () => void
  /** Texto tenue a la derecha: extensión de archivo, atajo… */
  hint?: string
  /** Encabezado de grupo que se dibuja *antes* de este elemento. */
  group?: string
  /** Acciones destructivas: van en rojo y separadas por una regla. */
  danger?: boolean
  /** Marca lo que aún no existía en la versión anterior. */
  isNew?: boolean
}

interface Props {
  label: string
  items: MenuItem[]
  /** Alinea el panel por la derecha; es lo correcto si el botón está al final de la barra. */
  align?: 'left' | 'right'
}

export function TransportMenu({ label, items, align = 'right' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Cerrar al pulsar fuera o con Escape. Se escucha en captura para que el
  // cierre gane a cualquier handler que detenga la propagación por el camino.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          height: 30, padding: '0 10px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${open ? v('accent') : v('panelRule')}`,
          background: open ? v('accent') : 'transparent',
          color: open ? '#fff' : v('panelInk'),
          fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
          transition: 'background .13s, color .13s, border-color .13s',
        }}
      >
        {label} ▾
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)',
            [align]: 0, minWidth: 190, zIndex: 60,
            background: v('card'), border: `1px solid ${v('rule')}`,
            borderRadius: 11, boxShadow: v('shadowLg'), padding: 5,
          }}
        >
          {items.map((item, i) => {
            const prev = items[i - 1]
            return (
              <div key={item.label}>
                {item.group && (
                  <div style={{
                    fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase',
                    color: v('dim'), fontWeight: 700, margin: '6px 8px 4px',
                  }}>{item.group}</div>
                )}
                {item.danger && prev && !prev.danger && (
                  <hr style={{ border: 'none', borderTop: `1px solid ${v('rule')}`, margin: '5px 4px' }} />
                )}
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); item.onClick() }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, width: '100%', padding: '7px 9px', border: 'none',
                    borderRadius: 7, background: 'transparent', cursor: 'pointer',
                    color: item.danger ? v('danger') : v('ink'),
                    fontSize: 12, fontWeight: 500, textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = v('sunken') }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span>{item.label}</span>
                  {item.isNew
                    ? <span style={{
                        fontFamily: 'var(--bt-mono)', fontSize: 9.5, color: '#fff',
                        background: v('accent'), padding: '1px 5px', borderRadius: 4,
                      }}>nuevo</span>
                    : item.hint
                      ? <span style={{
                          fontFamily: 'var(--bt-mono)', fontSize: 10, color: v('dim'),
                        }}>{item.hint}</span>
                      : null}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </span>
  )
}
