import React, { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';

// Define variants and sizes for consistent styling
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

// Basic button props
interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
  href?: string;
  onClick?: (event: any) => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  [key: string]: any; // For additional props
}

interface RippleProps {
  x: number;
  y: number;
  size: number;
}

const Button = ({
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false, 
  isLoading = false, 
  leftIcon, 
  rightIcon, 
  className = '', 
  href, 
  onClick, 
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) => {
  // State for ripple effect
  const [ripples, setRipples] = useState<RippleProps[]>([]);
  
  // Clean up ripples after they've animated
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (ripples.length > 0) {
        setRipples([]);
      }
    }, 1000);
    
    return () => clearTimeout(timeout);
  }, [ripples]);
  
  // Handle ripple effect on click
  const handleRipple = (e: any) => {
    const button = e.currentTarget.getBoundingClientRect();
    const size = Math.max(button.width, button.height);
    const x = e.clientX - button.left - size / 2;
    const y = e.clientY - button.top - size / 2;
    
    setRipples([...ripples, { x, y, size }]);
    
    if (onClick) {
      onClick(e);
    }
  };
  
  // Base styles that apply to all buttons with enhanced transitions and interactions
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium relative overflow-hidden transform transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] hover:-translate-y-[1px]';
  
  // Variant-specific styles with enhanced hover and active states
  const variantStyles = {
    primary: 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-md hover:shadow-lg active:shadow active:from-indigo-700 active:to-indigo-800 hover:shadow-indigo-500/40',
    secondary: 'bg-gray-700 text-white hover:bg-gray-800 shadow-md hover:shadow-lg active:shadow active:bg-gray-900 hover:shadow-gray-700/30',
    outline: 'border-2 border-gray-600 text-white hover:bg-gray-800 hover:border-gray-500 bg-transparent active:bg-gray-900',
    ghost: 'text-gray-300 hover:text-white hover:bg-gray-800 bg-transparent active:bg-gray-900',
    danger: 'bg-gradient-to-br from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-lg active:shadow active:from-red-700 active:to-red-800 hover:shadow-red-500/40',
  };
  
  // Size-specific styles
  const sizeStyles = {
    xs: 'text-xs px-2 py-1',
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };
  
  // Width style
  const widthStyle = fullWidth ? 'w-full' : '';
  
  // Combine all styles
  const buttonStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`;

  // Loading state
  const loadingSpinner = (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  // Ripple elements
  const rippleElements = ripples.map((ripple, i) => (
    <span 
      key={i}
      className="absolute rounded-full bg-white bg-opacity-30 animate-ripple pointer-events-none"
      style={{
        left: ripple.x,
        top: ripple.y,
        width: ripple.size,
        height: ripple.size,
      }}
    />
  ));

  // Content to render inside the button
  const content = (
    <>
      {rippleElements}
      {isLoading && loadingSpinner}
      {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
      <span className="relative z-10">{children}</span>
      {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
    </>
  );

  // If href is provided, render an anchor tag
  if (href) {
    return (
      <Link href={href}>
        <div className={buttonStyles} onClick={handleRipple}>
          {content}
        </div>
      </Link>
    );
  }

  // Otherwise, render a button
  return (
    <button 
      className={buttonStyles} 
      disabled={isLoading || disabled} 
      onClick={handleRipple}
      type={type}
      {...rest}
    >
      {content}
    </button>
  );
};

export default Button; 