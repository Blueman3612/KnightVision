import React, { ReactNode } from 'react';
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
  // Base styles that apply to all buttons
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed';
  
  // Variant-specific styles
  const variantStyles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-gray-700 text-white hover:bg-gray-800',
    outline: 'border border-gray-600 text-white hover:bg-gray-800 bg-transparent',
    ghost: 'text-gray-300 hover:text-white hover:bg-gray-800 bg-transparent',
    danger: 'bg-red-600 text-white hover:bg-red-700',
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

  // Content to render inside the button
  const content = (
    <>
      {isLoading && loadingSpinner}
      {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
    </>
  );

  // If href is provided, render an anchor tag
  if (href) {
    return (
      <Link href={href}>
        <div className={buttonStyles}>{content}</div>
      </Link>
    );
  }

  // Otherwise, render a button
  return (
    <button 
      className={buttonStyles} 
      disabled={isLoading || disabled} 
      onClick={onClick}
      type={type}
      {...rest}
    >
      {content}
    </button>
  );
};

export default Button; 