import React, { useState, useRef, useEffect, ReactNode } from 'react';

// Define variants and sizes for consistent styling
type InputVariant = 'default' | 'filled' | 'outline' | 'underlined';
type InputSize = 'sm' | 'md' | 'lg';

interface TextInputProps {
  // Core input properties
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
  onChange?: (e: any) => void;
  onFocus?: (e: any) => void;
  onBlur?: (e: any) => void;
  
  // Styling options
  variant?: InputVariant;
  size?: InputSize;
  className?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  
  // Label and helper text
  label?: string;
  helperText?: string;
  error?: string | boolean;
  
  // Icons and adornments
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  showClearButton?: boolean;
  
  // Textarea or input
  multiline?: boolean;
  rows?: number;
  maxRows?: number;
  maxLength?: number;
  
  // Misc
  required?: boolean;
  autoFocus?: boolean;
  [key: string]: any;
}

const TextInput = ({
  // Default values
  id,
  name,
  value,
  defaultValue,
  placeholder,
  type = 'text',
  onChange,
  onFocus,
  onBlur,
  variant = 'default',
  size = 'md',
  className = '',
  fullWidth = false,
  disabled = false,
  readOnly = false,
  label,
  helperText,
  error,
  leftIcon,
  rightIcon,
  showClearButton = false,
  multiline = false,
  rows = 3,
  maxRows,
  maxLength,
  required = false,
  autoFocus = false,
  ...rest
}: TextInputProps) => {
  // State for focus to manage animations
  const [isFocused, setIsFocused] = useState(false);
  const [innerValue, setInnerValue] = useState(value || defaultValue || '');
  const [clearHovered, setClearHovered] = useState(false);
  const [clearActive, setClearActive] = useState(false);
  const inputRef = useRef<any>(null);
  
  // Update internal state when value prop changes
  useEffect(() => {
    if (value !== undefined) {
      setInnerValue(value);
    }
  }, [value]);
  
  // Handle focus event
  const handleFocus = (e: any) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };
  
  // Handle blur event
  const handleBlur = (e: any) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };
  
  // Handle change event and update internal state
  const handleChange = (e: any) => {
    const newValue = e.target.value;
    if (value === undefined) {
      // Only update internal state if we're not controlled
      setInnerValue(newValue);
    }
    if (onChange) onChange(e);
  };
  
  // Handle clearing the input
  const handleClear = () => {
    if (value === undefined) {
      setInnerValue('');
    }
    
    // Simulate an onChange event
    if (onChange && inputRef.current) {
      const event = {
        target: {
          value: '',
          name,
          id
        }
      };
      onChange(event);
    }
    
    // Focus the input after clearing
    if (inputRef.current) {
      inputRef.current.focus();
    }

    // Visual feedback for click
    setClearActive(true);
    setTimeout(() => setClearActive(false), 150);
  };
  
  // Size-specific styles
  const sizeStyles = {
    sm: 'text-xs px-2 py-1.5',
    md: 'text-sm px-3 py-2',
    lg: 'text-base px-4 py-2.5',
  };
  
  // Base container styles
  const containerBaseStyles = 'relative flex flex-col w-full';
  const containerWidthStyles = fullWidth ? 'w-full' : 'max-w-md';
  const containerStyles = `${containerBaseStyles} ${containerWidthStyles} ${className}`;
  
  // Label styles
  const labelBaseStyles = 'block text-sm font-medium transition-all duration-200 mb-1';
  const labelErrorStyles = error ? 'text-red-500' : 'text-gray-200';
  const labelFocusStyles = isFocused && !error ? 'text-indigo-400' : '';
  const labelDisabledStyles = disabled ? 'text-gray-400' : '';
  const labelStyles = `${labelBaseStyles} ${labelErrorStyles} ${labelFocusStyles} ${labelDisabledStyles}`;
  
  // Input wrapper styles for consistent icons and padding
  const inputWrapperBaseStyles = 'relative flex items-center overflow-hidden rounded-md transition-all duration-300';
  
  // Shadow styles for floating effect - consistent on all sides without vertical translation
  const shadowStyles = isFocused 
    ? 'shadow-[0_0_16px_rgba(124,58,237,0.5)]' 
    : 'shadow-[0_0_12px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(124,58,237,0.6)]';
  
  // Variant-specific styles (removed extra shadow styles)
  const variantStyles = {
    default: `bg-gray-800 border ${error ? 'border-red-500' : isFocused ? 'border-indigo-500' : 'border-gray-600'}`,
    filled: `bg-gray-700 ${error ? 'bg-red-900/20' : isFocused ? 'bg-gray-700' : 'bg-gray-800'} border-b-2 ${error ? 'border-red-500' : isFocused ? 'border-indigo-500' : 'border-gray-600'}`,
    outline: `bg-transparent border-2 ${error ? 'border-red-500' : isFocused ? 'border-indigo-500' : 'border-gray-600'}`,
    underlined: `bg-transparent border-b-2 rounded-none ${error ? 'border-red-500' : isFocused ? 'border-indigo-500' : 'border-gray-600'}`,
  };
  
  const inputWrapperStyles = `${inputWrapperBaseStyles} ${variantStyles[variant]} ${shadowStyles} transition-all`;
  
  // Input field styles
  const inputBaseStyles = 'block w-full bg-transparent outline-none transition-all duration-200 text-gray-100 placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed';
  const inputDisabledStyles = disabled ? 'opacity-60 cursor-not-allowed' : '';
  
  // Custom scrollbar styles - making it wider
  const scrollbarStyles = multiline ? `
    overflow-y-auto 
    scrollbar-wide 
    scrollbar-thumb-indigo-500 
    scrollbar-track-gray-700 
    scrollbar-thumb-rounded-full 
    scrollbar-track-rounded-full
    pr-10
  ` : '';
  
  const inputStyles = `${inputBaseStyles} ${inputDisabledStyles} ${sizeStyles[size]} ${scrollbarStyles}`;
  
  // Helper text styles
  const helperBaseStyles = 'mt-1 text-xs';
  const helperErrorStyles = error ? 'text-red-500' : 'text-gray-400';
  const helperStyles = `${helperBaseStyles} ${helperErrorStyles}`;
  
  // Left icon container styles with subtle hover effect
  const leftIconStyles = 'absolute left-2.5 flex items-center justify-center transition-all duration-200';
  const leftIconColorStyles = error 
    ? 'text-red-500' 
    : isFocused 
      ? 'text-indigo-400' 
      : 'text-gray-400';
  
  // Clear button visible when input has value and showClearButton is true
  const showClear = showClearButton && innerValue.length > 0 && !disabled && !readOnly;
  
  // Determine if we're showing any right side content
  const hasRightContent = rightIcon || showClear;
  
  // Added custom CSS for scrollbar (fallback to our CSS approach)
  useEffect(() => {
    if (multiline) {
      const style = document.createElement('style');
      style.textContent = `
        textarea::-webkit-scrollbar {
          width: 14px;
          height: 14px;
        }
        textarea::-webkit-scrollbar-track {
          background: #374151;
          border-radius: 9999px;
        }
        textarea::-webkit-scrollbar-thumb {
          background: #6366f1;
          border-radius: 9999px;
        }
        textarea::-webkit-scrollbar-thumb:hover {
          background: #818cf8;
        }
      `;
      document.head.appendChild(style);
      
      return () => {
        document.head.removeChild(style);
      };
    }
  }, [multiline]);
  
  // Create the input element based on multiline flag
  const inputElement = multiline ? (
    <textarea
      className={`${inputStyles} resize-none ${hasRightContent ? 'pr-16' : ''}`}
      ref={inputRef}
      id={id}
      name={name}
      value={value !== undefined ? value : innerValue}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      autoFocus={autoFocus}
      rows={rows}
      maxLength={maxLength}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      {...rest}
    />
  ) : (
    <input
      className={`${inputStyles} ${hasRightContent ? 'pr-12' : ''} ${leftIcon ? 'pl-9' : ''}`}
      ref={inputRef}
      id={id}
      name={name}
      type={type}
      value={value !== undefined ? value : innerValue}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      autoFocus={autoFocus}
      maxLength={maxLength}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      {...rest}
    />
  );
  
  // Clear button with enhanced visibility
  const clearButton = (
    <button
      type="button"
      className={`
        absolute top-2 right-5 flex items-center justify-center
        transform transition-all duration-200 ease-out
        h-7 w-7 rounded-full z-10
        ${clearActive ? 'scale-90 bg-indigo-600' : clearHovered ? 'scale-105 bg-indigo-500' : 'bg-indigo-500 hover:bg-indigo-600'} 
        text-white shadow-md
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50
      `}
      onClick={handleClear}
      onMouseEnter={() => setClearHovered(true)}
      onMouseLeave={() => setClearHovered(false)}
      onMouseDown={() => setClearActive(true)}
      onMouseUp={() => setClearActive(false)}
      tabIndex={-1}
      aria-label="Clear input"
    >
      <div className="relative flex items-center justify-center w-full h-full font-bold">
        <span className="absolute text-lg leading-none">×</span>
      </div>
    </button>
  );
  
  return (
    <div className={containerStyles}>
      {/* Label if provided */}
      {label && (
        <label htmlFor={id} className={labelStyles}>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      {/* Input wrapper with icons */}
      <div className={inputWrapperStyles}>
        {/* Left icon if provided - but ONLY for non-multiline inputs */}
        {leftIcon && !multiline && (
          <div className={`${leftIconStyles} ${leftIconColorStyles} pointer-events-none`}>
            {leftIcon}
          </div>
        )}
        
        {/* Input element */}
        {inputElement}
        
        {/* Right icon if provided and clear button not showing */}
        {rightIcon && !showClear && (
          <div className="absolute right-2.5 flex items-center justify-center pointer-events-none text-gray-400">
            {rightIcon}
          </div>
        )}
        
        {/* Enhanced clear button */}
        {showClear && clearButton}
      </div>
      
      {/* Helper text or error message */}
      {(helperText || error) && (
        <p className={helperStyles}>
          {typeof error === 'string' ? error : helperText}
        </p>
      )}
    </div>
  );
};

export default TextInput; 