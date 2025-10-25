
import React from 'react';

interface IconButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}

const IconButton: React.FC<IconButtonProps> = ({ onClick, children, label }) => {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 transition-colors"
    >
      {children}
    </button>
  );
};

export default IconButton;
