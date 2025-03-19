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
  const [isMounted, setIsMounted] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });

  // Handle mounting for SSR compatibility
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Calculate position whenever visibility changes or window resizes
  useEffect(() => {
    const calculatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current || !isVisible) return;
      
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      let x = 0;
      let y = 0;
      
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
      
      // Adjust for viewport edges
      const padding = 10;
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
      
      // Update position
      positionRef.current = { x, y };
      
      // Apply position to tooltip element directly
      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${x}px`;
        tooltipRef.current.style.top = `${y}px`;
        tooltipRef.current.style.opacity = '1';
        tooltipRef.current.style.transform = 'scale(1)';
        tooltipRef.current.style.visibility = 'visible';
      }
      
      setIsPositioned(true);
    };
    
    // Initial calculation
    if (isVisible) {
      setIsPositioned(false);
      
      // First render tooltip as invisible
      if (tooltipRef.current) {
        tooltipRef.current.style.opacity = '0';
        tooltipRef.current.style.transform = 'scale(0.95)';
        tooltipRef.current.style.visibility = 'hidden';
      }
      
      // Then calculate position after a small delay to ensure tooltip is rendered
      setTimeout(calculatePosition, 10);
      
      // Update position on scroll/resize
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
    setIsPositioned(false);
  };

  // Styles for tooltip
  const tooltipBaseStyles = 
    'fixed z-[9999] px-4 py-2.5 text-sm text-white text-center font-medium pointer-events-none rounded-lg shadow-lg backdrop-blur-[2px]';
  
  const tooltipBackground = 'bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700';
  
  const transitionStyles = 'transition-all duration-200 ease-in-out';
  
  const arrowStyles = {
    top: 'after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-t-gray-800',
    right: 'after:absolute after:top-1/2 after:left-0 after:-translate-y-1/2 after:-translate-x-full after:border-[6px] after:border-transparent after:border-r-gray-800',
    bottom: 'after:absolute after:bottom-full after:left-1/2 after:-translate-x-1/2 after:border-[6px] after:border-transparent after:border-b-gray-800',
    left: 'after:absolute after:top-1/2 after:right-0 after:-translate-y-1/2 after:translate-x-full after:border-[6px] after:border-transparent after:border-l-gray-800'
  };

  // Render the tooltip only after component mounts (for SSR compatibility)
  const renderTooltip = () => {
    if (!isMounted || !isVisible) return null;
    
    return createPortal(
      <div
        ref={tooltipRef}
        className={`
          ${tooltipBaseStyles}
          ${tooltipBackground}
          ${transitionStyles}
          ${arrowStyles[position]}
          ${className}
        `}
        style={{
          maxWidth: '280px',
          opacity: '0',
          transform: 'scale(0.95)',
          visibility: 'hidden'
        }}
        role="tooltip"
      >
        {content}
      </div>,
      document.body
    );
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
      {renderTooltip()}
    </div>
  );
};

export default Tooltip; 