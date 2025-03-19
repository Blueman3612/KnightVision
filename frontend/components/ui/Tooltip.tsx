import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
  className?: string;
  offset?: number;
}

const Tooltip = ({
  children,
  content,
  position = 'top',
  delay = 300,
  className = '',
  offset = 8
}: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle mounting for SSR compatibility
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Calculate position on mount and resize
  useEffect(() => {
    const calculatePosition = () => {
      if (!triggerRef.current || !isVisible) return;
      
      const triggerRect = triggerRef.current.getBoundingClientRect();
      
      // Calculate tooltip size and position based on trigger element
      let x = 0;
      let y = 0;
      
      // We need to wait for the tooltip to be rendered before measuring its size
      requestAnimationFrame(() => {
        if (!tooltipRef.current) return;
        
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        
        switch (position) {
          case 'top':
            x = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
            y = triggerRect.top - tooltipRect.height - offset;
            break;
          case 'right':
            x = triggerRect.right + offset;
            y = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
            break;
          case 'bottom':
            x = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
            y = triggerRect.bottom + offset;
            break;
          case 'left':
            x = triggerRect.left - tooltipRect.width - offset;
            y = triggerRect.top + (triggerRect.height / 2) - (tooltipRect.height / 2);
            break;
        }
        
        // Adjust to keep tooltip within viewport
        const padding = 10; // Padding from edge of viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (x < padding) x = padding;
        if (x + tooltipRect.width > viewportWidth - padding) {
          x = viewportWidth - tooltipRect.width - padding;
        }
        
        if (y < padding) y = padding;
        if (y + tooltipRect.height > viewportHeight - padding) {
          y = viewportHeight - tooltipRect.height - padding;
        }
        
        setCoords({ x, y });
      });
    };

    if (isVisible) {
      calculatePosition();
      window.addEventListener('resize', calculatePosition);
      window.addEventListener('scroll', calculatePosition);
      
      return () => {
        window.removeEventListener('resize', calculatePosition);
        window.removeEventListener('scroll', calculatePosition);
      };
    }
  }, [isVisible, position, offset]);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
  };

  // Base tooltip styles
  const tooltipBaseStyles = 
    'fixed z-[9999] px-3 py-2 text-sm text-white bg-gray-800 rounded shadow-lg pointer-events-none transform transition-all duration-200 ease-in-out';
  
  // Position-specific arrow styles
  const arrowStyles = {
    top: 'after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-8 after:border-transparent after:border-t-gray-800',
    right: 'after:absolute after:top-1/2 after:left-0 after:-translate-y-1/2 after:-translate-x-full after:border-8 after:border-transparent after:border-r-gray-800',
    bottom: 'after:absolute after:bottom-full after:left-1/2 after:-translate-x-1/2 after:border-8 after:border-transparent after:border-b-gray-800',
    left: 'after:absolute after:top-1/2 after:right-0 after:-translate-y-1/2 after:translate-x-full after:border-8 after:border-transparent after:border-l-gray-800'
  };

  return (
    <div 
      ref={triggerRef}
      className="inline-flex relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      
      {mounted && isVisible && createPortal(
        <div
          ref={tooltipRef}
          className={`
            ${tooltipBaseStyles}
            ${arrowStyles[position]}
            ${isVisible ? 'opacity-100' : 'opacity-0'}
            ${className}
          `}
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            maxWidth: '280px'
          }}
          role="tooltip"
        >
          {content}
        </div>,
        document.body
      )}
    </div>
  );
};

export default Tooltip; 