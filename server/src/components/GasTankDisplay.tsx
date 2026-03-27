import React from 'react';
import TopUpButton from './TopUpButton';

interface GasTankDisplayProps {
  balance: number | null;
  onTopUp: () => void;
}

const GasTankDisplay: React.FC<GasTankDisplayProps> = ({ balance, onTopUp }) => {
  return (
    <div style={{
      backgroundColor: '#1a1a1a',
      border: '1px solid #333',
      padding: '1.5rem',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: '1rem'
    }}>
       <div>
          <h2 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '0.5rem' }}>Gas Tank</h2>
          <p style={{ color: '#888', fontSize: '0.9rem', lineHeight: '1.4' }}>
             Purchase execution credits. Your swarm consumes 1 Gas Credit per successful execution.
          </p>
       </div>
       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#ccc', fontSize: '0.9rem' }}>
             Available Balance: <strong style={{ color: balance !== null && balance > 0 ? '#86efac' : '#fca5a5' }}>
               {balance !== null ? balance : '...'} Credits
             </strong>
          </span>
          <TopUpButton onTopUp={onTopUp} />
       </div>
    </div>
  );
};

export default GasTankDisplay;
