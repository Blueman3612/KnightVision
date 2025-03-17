import * as React from 'react';
import { ToastContainer } from './Toast';
import { createPortal } from 'react-dom';

// Toast types
type ToastVariant = 'success' | 'error' | 'info' | 'warning';
type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

// Individual toast data structure
interface Toast {
  id: string;
  message: string | React.ReactNode;
  variant: ToastVariant;
  duration: number;
  position?: ToastPosition;
  className?: string;
}

// Context for the toast functionality
interface ToastContextType {
  success: (message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => void;
  error: (message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => void;
  info: (message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => void;
  warning: (message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => void;
  remove: (id: string) => void;
  removeAll: () => void;
}

// Create the context
const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

// Provider component
interface ToastProviderProps {
  children: React.ReactNode;
  defaultPosition?: ToastPosition;
  defaultDuration?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  defaultPosition = 'top-center',
  defaultDuration = 4000,
}) => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [isBrowser, setIsBrowser] = React.useState(false);
  
  // Initialize browser check
  React.useEffect(() => {
    setIsBrowser(true);
  }, []);
  
  // Helper to add a toast
  const addToast = React.useCallback((
    message: string | React.ReactNode, 
    variant: ToastVariant,
    options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      id,
      message,
      variant,
      duration: options?.duration || defaultDuration,
      position: options?.position || defaultPosition,
      className: options?.className,
    };
    
    setToasts((prevToasts) => [...prevToasts, newToast]);
    return id;
  }, [defaultDuration, defaultPosition]);
  
  // Remove a specific toast
  const remove = React.useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);
  
  // Remove all toasts
  const removeAll = React.useCallback(() => {
    setToasts([]);
  }, []);
  
  // Convenience methods for different toast types
  const success = React.useCallback((message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => 
    addToast(message, 'success', options), [addToast]);
  
  const error = React.useCallback((message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => 
    addToast(message, 'error', options), [addToast]);
  
  const info = React.useCallback((message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => 
    addToast(message, 'info', options), [addToast]);
  
  const warning = React.useCallback((message: string | React.ReactNode, options?: Partial<Omit<Toast, 'id' | 'message' | 'variant'>>) => 
    addToast(message, 'warning', options), [addToast]);
  
  // Create context value
  const contextValue = React.useMemo(() => ({
    success,
    error,
    info,
    warning,
    remove,
    removeAll
  }), [success, error, info, warning, remove, removeAll]);
  
  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {isBrowser && 
        createPortal(
          <ToastContainer 
            toasts={toasts.map(toast => ({
              ...toast,
              onClose: remove,
            }))} 
            position={defaultPosition}
          />,
          document.body
        )
      }
    </ToastContext.Provider>
  );
};

// Custom hook to use the toast context
export const useToast = (): ToastContextType => {
  const context = React.useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}; 