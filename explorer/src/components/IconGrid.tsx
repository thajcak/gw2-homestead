import React from 'react';
import { Decoration } from '../types';

interface IconGridProps {
  decorations: Decoration[];
  onDecorationClick: (decoration: Decoration) => void;
  onDecorationHover: (decoration: Decoration) => void;
}

export const IconGrid: React.FC<IconGridProps> = ({
  decorations,
  onDecorationClick,
  onDecorationHover
}) => {
  return (
    <div id="iconContainer">
      {decorations.map((decoration) => (
        <div
          key={decoration.id}
          className="icon"
          style={{ backgroundImage: `url(${decoration.icon})` }}
          onClick={() => onDecorationClick(decoration)}
          onMouseEnter={() => onDecorationHover(decoration)}
          data-id={decoration.id}
        />
      ))}
    </div>
  );
};
