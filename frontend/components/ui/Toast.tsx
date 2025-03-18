import React, { useEffect, ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface ToastProps {
  id: string;
  message: string | ReactNode;
  variant?: ToastVariant;
  duration?: number;
  onClose: (id: string) => void;
  position?: ToastPosition;
  className?: string;
}

interface ToastContainerProps {
  toasts: ToastProps[];
  position?: ToastPosition;
}

// Individual toast component
const Toast = ({ 
  id,
  message, 
  variant = 'info', 
  duration = 4000, 
  onClose,
  className = ''
}: ToastProps) => {
  // Track whether the toast is exiting for animation
  const [isExiting, setIsExiting] = useState(false);

  // Handle close with animation
  const handleClose = () => {
    setIsExiting(true);
    // Wait for animation to complete before removing
    setTimeout(() => {
      onClose(id);
    }, 500); // Match this with animation duration
  };
  
  // Auto-close after duration
  useEffect(() => {
    const timer = setTimeout(() => {
      handleClose();
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, id]);
  
  // Variant-specific styles and icons
  const variantStyles = {
    success: 'border-l-4 border-green-500 bg-gradient-to-r from-gray-800 to-gray-700',
    error: 'border-l-4 border-red-500 bg-gradient-to-r from-gray-800 to-gray-700',
    info: 'border-l-4 border-indigo-500 bg-gradient-to-r from-gray-800 to-gray-700',
    warning: 'border-l-4 border-yellow-500 bg-gradient-to-r from-gray-800 to-gray-700',
  };
  
  const icons = {
    success: (
      <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  };
  
  return (
    <div 
      className={`flex items-center p-4 mb-3 rounded-md shadow-lg text-white transform transition-all duration-300 ${variantStyles[variant]} ${className} ${isExiting ? 'animate-fade-out' : 'animate-fade-in'}`}
      role="alert"
    >
      <div className="flex-shrink-0 mr-3">
        {icons[variant]}
      </div>
      <div className="flex-1 mr-2">
        {typeof message === 'string' ? (
          <p className="text-sm font-medium">{message}</p>
        ) : (
          message
        )}
      </div>
      <button 
        onClick={handleClose} 
        className="flex-shrink-0 ml-auto rounded-full p-1 text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        aria-label="Close"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

// Container component to position toasts
const ToastContainer = ({ toasts, position = 'top-center' }: ToastContainerProps) => {
  // Don't render if no toasts
  if (toasts.length === 0) return null;
  
  // Position styles
  const positionClasses = {
    'top-left': 'top-0 left-0 p-4',
    'top-center': 'top-0 left-1/2 transform -translate-x-1/2 p-4',
    'top-right': 'top-0 right-0 p-4',
    'bottom-left': 'bottom-0 left-0 p-4',
    'bottom-center': 'bottom-0 left-1/2 transform -translate-x-1/2 p-4',
    'bottom-right': 'bottom-0 right-0 p-4',
  };
  
  return (
    <div className={`fixed z-50 w-full max-w-sm ${positionClasses[position]}`}>
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} />
      ))}
    </div>
  );
};

export { Toast, ToastContainer };

// Add animation to tailwind.config.js
// extend: {
//   animation: {
//     'fade-in': 'fadeIn 0.3s ease-in-out',
//   },
//   keyframes: {
//     fadeIn: {
//       '0%': { opacity: 0, transform: 'translateY(-10px)' },
//       '100%': { opacity: 1, transform: 'translateY(0)' },
//     },
//   },
// }, 