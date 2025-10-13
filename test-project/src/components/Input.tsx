import React from 'react';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'password';
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  type = 'text'
}) => {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="input"
    />
  );
};