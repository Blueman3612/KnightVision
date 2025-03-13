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
}

// Modal component props
export interface ModalProps {
  // Core modal properties
  isOpen: boolean;
  onClose: () => void;
  
  // Styling and layout
  size?: ModalSize;
  className?: string;
  
  // Modal content structure
  title?: string;
  showCloseButton?: boolean;
  children: ReactNode;
  
  // Pre-configured buttons
  primaryButton?: ModalButtonProps;
  secondaryButton?: ModalButtonProps;
}

export default function Modal({
  isOpen,
  onClose,
  size = 'md',
  className = '',
  title,
  showCloseButton = true,
  children,
  primaryButton,
  secondaryButton,
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Background overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-75" onClick={onClose}></div>
      
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div 
          className={`relative w-full ${sizeClasses[size]} transform overflow-hidden rounded-lg bg-gray-800 text-white shadow-xl transition-all ${className}`}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              {title && <h3 className="text-lg font-semibold">{title}</h3>}
              
              {showCloseButton && (
                <button
                  type="button"
                  className="text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-full p-1 transition-colors duration-150"
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
          
          {/* Content */}
          <div className="px-6 py-4">
            {children}
          </div>
          
          {/* Footer */}
          {(primaryButton || secondaryButton) && (
            <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
              {secondaryButton && (
                <Button
                  variant={secondaryButton.variant || 'ghost'}
                  onClick={secondaryButton.onClick}
                  disabled={secondaryButton.disabled}
                  isLoading={secondaryButton.isLoading}
                  type={secondaryButton.type || 'button'}
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