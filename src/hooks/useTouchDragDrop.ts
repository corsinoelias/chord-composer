import { useRef, useCallback, useState, useEffect } from 'react';

interface TouchDragDropOptions<T> {
  items: T[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  getItemId: (item: T) => string;
  dragThreshold?: number;
  holdDelay?: number;
}

interface TouchDragState {
  isDragging: boolean;
  draggedIndex: number | null;
  dropTargetIndex: number | null;
  dropPosition: 'before' | 'after' | null;
  touchOffset: { x: number; y: number };
}

export function useTouchDragDrop<T>({
  items,
  onReorder,
  getItemId,
  dragThreshold = 10,
  holdDelay = 150,
}: TouchDragDropOptions<T>) {
  const [state, setState] = useState<TouchDragState>({
    isDragging: false,
    draggedIndex: null,
    dropTargetIndex: null,
    dropPosition: null,
    touchOffset: { x: 0, y: 0 },
  });

  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const itemRectsRef = useRef<Map<number, DOMRect>>(new Map());
  const draggedElementRef = useRef<HTMLElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (ghostRef.current) {
        document.body.removeChild(ghostRef.current);
        ghostRef.current = null;
      }
    };
  }, []);

  const createGhostElement = useCallback((element: HTMLElement, x: number, y: number) => {
    const ghost = document.createElement('div');
    ghost.className = 'fixed pointer-events-none z-[9999] transition-transform duration-75';
    ghost.style.width = `${element.offsetWidth}px`;
    ghost.style.opacity = '0.9';
    ghost.style.transform = 'scale(1.02)';
    ghost.innerHTML = element.outerHTML;
    
    // Style the ghost
    const innerEl = ghost.firstElementChild as HTMLElement;
    if (innerEl) {
      innerEl.style.boxShadow = '0 10px 40px rgba(0,0,0,0.3)';
      innerEl.style.borderRadius = '12px';
    }
    
    ghost.style.left = `${x - element.offsetWidth / 2}px`;
    ghost.style.top = `${y - 30}px`;
    
    document.body.appendChild(ghost);
    return ghost;
  }, []);

  const updateGhostPosition = useCallback((x: number, y: number) => {
    if (ghostRef.current && draggedElementRef.current) {
      ghostRef.current.style.left = `${x - draggedElementRef.current.offsetWidth / 2}px`;
      ghostRef.current.style.top = `${y - 30}px`;
    }
  }, []);

  const calculateDropTarget = useCallback((y: number) => {
    let closestIndex = -1;
    let closestDistance = Infinity;
    let position: 'before' | 'after' = 'before';

    itemRectsRef.current.forEach((rect, index) => {
      const midY = rect.top + rect.height / 2;
      const distance = Math.abs(y - midY);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
        position = y < midY ? 'before' : 'after';
      }
    });

    return { index: closestIndex, position };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, index: number, element: HTMLElement) => {
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    draggedElementRef.current = element;

    // Collect all item rects
    const parent = element.parentElement;
    if (parent) {
      itemRectsRef.current.clear();
      Array.from(parent.children).forEach((child, i) => {
        if (child instanceof HTMLElement) {
          itemRectsRef.current.set(i, child.getBoundingClientRect());
        }
      });
    }

    holdTimerRef.current = setTimeout(() => {
      // Vibrate for haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      setState({
        isDragging: true,
        draggedIndex: index,
        dropTargetIndex: index,
        dropPosition: null,
        touchOffset: { x: touch.clientX, y: touch.clientY },
      });

      ghostRef.current = createGhostElement(element, touch.clientX, touch.clientY);
    }, holdDelay);
  }, [holdDelay, createGhostElement]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // Cancel if we haven't started dragging and moved too much
    if (!state.isDragging && startPosRef.current) {
      const dx = Math.abs(touch.clientX - startPosRef.current.x);
      const dy = Math.abs(touch.clientY - startPosRef.current.y);
      
      if (dx > dragThreshold || dy > dragThreshold) {
        if (holdTimerRef.current) {
          clearTimeout(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        return;
      }
    }

    if (!state.isDragging) return;

    e.preventDefault();
    updateGhostPosition(touch.clientX, touch.clientY);

    const { index, position } = calculateDropTarget(touch.clientY);
    
    if (index !== -1) {
      setState(prev => ({
        ...prev,
        dropTargetIndex: index,
        dropPosition: position,
      }));
    }
  }, [state.isDragging, dragThreshold, updateGhostPosition, calculateDropTarget]);

  const handleTouchEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (state.isDragging && state.draggedIndex !== null && state.dropTargetIndex !== null) {
      let toIndex = state.dropTargetIndex;
      if (state.dropPosition === 'after') {
        toIndex++;
      }
      
      // Adjust for the removal
      if (state.draggedIndex < toIndex) {
        toIndex--;
      }
      
      if (state.draggedIndex !== toIndex) {
        onReorder(state.draggedIndex, toIndex);
      }
    }

    // Cleanup ghost
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }

    setState({
      isDragging: false,
      draggedIndex: null,
      dropTargetIndex: null,
      dropPosition: null,
      touchOffset: { x: 0, y: 0 },
    });
    
    startPosRef.current = null;
    draggedElementRef.current = null;
  }, [state, onReorder]);

  const handleTouchCancel = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }

    setState({
      isDragging: false,
      draggedIndex: null,
      dropTargetIndex: null,
      dropPosition: null,
      touchOffset: { x: 0, y: 0 },
    });
    
    startPosRef.current = null;
    draggedElementRef.current = null;
  }, []);

  return {
    state,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
  };
}
