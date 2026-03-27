import React from 'react';

interface TopUpButtonProps {
  onTopUp: () => void;
}

const TopUpButton: React.FC<TopUpButtonProps> = ({ onTopUp }) => {
  return (
    <button
      onClick={onTopUp}
      style={{
        backgroundColor: '#00E5CC',
        color: '#000',
        border: 'none',
        borderRadius: '4px',
        padding: '0.5rem 1rem',
        fontSize: '0.9rem',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'opacity 0.2s'
      }}>
      Top Up
    </button>
  );
};

export default TopUpButton;
