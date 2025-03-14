import React, { ReactNode, useEffect } from 'react';
import { Button } from '.';

// Define size variants for the modal
type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

// Configuration for a button in the modal footer
export interface ModalButtonProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string; // Add custom class support for buttons
}

// Modal component props
export interface ModalProps {
  // Core modal properties
  isOpen: boolean;
  onClose: () => void;
  
  // Styling and layout
  size?: ModalSize;
  className?: string;
  overlayClassName?: string;
  contentClassName?: string;
  
  // Modal content structure
  title?: string | ReactNode;
  showCloseButton?: boolean;
  children: ReactNode;
  
  // Pre-configured buttons
  primaryButton?: ModalButtonProps;
  secondaryButton?: ModalButtonProps;
  
  // Animation options
  animationDuration?: number;
}

export default function Modal({
  isOpen,
  onClose,
  size = 'md',
  className = '',
  overlayClassName = '',
  contentClassName = '',
  title,
  showCloseButton = true,
  children,
  primaryButton,
  secondaryButton,
  animationDuration = 200,
}: ModalProps) {
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Don't render if not open
  if (!isOpen) return null;

  // Size variants
  const sizeClasses = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full mx-4',
  };

  const animationStyle = {
    transition: `all ${animationDuration}ms ease-in-out`,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      {/* Background overlay with improved animation */}
      <div 
        className={`fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm transition-opacity ${overlayClassName}`} 
        onClick={onClose}
        style={animationStyle}
      ></div>
      
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div 
          className={`relative w-full ${sizeClasses[size]} transform overflow-hidden rounded-lg bg-gray-800 text-white shadow-2xl transition-all 
          ${className}`}
          style={animationStyle}
        >
          {/* Header with improved styling */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900">
              {title && (
                typeof title === 'string' 
                  ? <h3 className="text-lg font-semibold text-white">{title}</h3>
                  : title
              )}
              
              {showCloseButton && (
                <button
                  type="button"
                  className="text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full p-1.5 hover:bg-gray-700 transition-colors duration-150"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
          
          {/* Content with improved padding and styling */}
          <div className={`px-6 py-5 ${contentClassName}`}>
            {children}
          </div>
          
          {/* Footer with improved styling */}
          {(primaryButton || secondaryButton) && (
            <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
              {secondaryButton && (
                <Button
                  variant={secondaryButton.variant || 'ghost'}
                  onClick={secondaryButton.onClick}
                  disabled={secondaryButton.disabled}
                  isLoading={secondaryButton.isLoading}
                  type={secondaryButton.type || 'button'}
                  className={secondaryButton.className}
                >
                  {secondaryButton.label}
                </Button>
              )}
              
              {primaryButton && (
                <Button
                  variant={primaryButton.variant || 'primary'}
                  onClick={primaryButton.onClick}
                  disabled={primaryButton.disabled}
                  isLoading={primaryButton.isLoading}
                  type={primaryButton.type || 'button'}
                  className={primaryButton.className}
                >
                  {primaryButton.label}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 