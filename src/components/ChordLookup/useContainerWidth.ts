import { useCallback, useRef, useState } from 'react'

/**
 * Ancho real del contenedor, medido en vivo.
 *
 * Los lienzos de estas paginas (diapason, teclado, diagrama) estan dibujados con coordenadas
 * absolutas en pixeles, asi que no hay forma de que se adapten solos: hay que medir y
 * recalcular. Se mide el contenedor y no la ventana porque el mismo componente vive en un
 * panel de 440px en escritorio y a ancho completo en movil, y lo que importa es el hueco que
 * tiene, no el dispositivo.
 *
 * Arranca en `fallback` —la medida de escritorio— porque la isla tambien se renderiza en el
 * servidor: asi el primer pintado ya reserva su tamano y no hay salto de layout.
 *
 * La referencia es una funcion y no un objeto porque estos lienzos se montan y desmontan al
 * cambiar de modo, y un `ResizeObserver` atado en un efecto se quedaria observando el nodo
 * viejo.
 */
export function useContainerWidth<T extends HTMLElement>(fallback: number) {
  const [width, setWidth] = useState(fallback)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    observer.current = ro
    measure()
  }, [])

  return [ref, width] as const
}
