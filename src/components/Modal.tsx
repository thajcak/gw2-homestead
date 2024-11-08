import React from 'react';
import { Decoration } from '../types';

interface ModalProps {
  decoration?: Decoration;
  onClose: () => void;
}

export const Modal: React.FC<ModalProps> = ({ decoration, onClose }) => {
  if (!decoration) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{decoration.name}</h2>
        {decoration.original && (
          <img 
            src={decoration.original.source} 
            alt={decoration.name}
            style={{
              maxWidth: '100%',
              maxHeight: '70vh'
            }}
          />
        )}
        {decoration.description && (
          <p className="modal-description">{decoration.description}</p>
        )}
      </div>
    </div>
  );
}; 