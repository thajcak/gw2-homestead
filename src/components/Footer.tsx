import React from 'react';
import { Decoration, Category } from '../types';

interface FooterProps {
  selectedDecoration?: Decoration;
  categories: Category[];
}

export const Footer: React.FC<FooterProps> = ({ selectedDecoration, categories }) => {
  if (!selectedDecoration) return <div id="footer" />;

  const categoryNames = selectedDecoration.categories
    .map(id => categories.find(cat => cat.id === id)?.name)
    .filter(Boolean)
    .map(name => <span key={name} className="badge">{name}</span>);

  return (
    <div id="footer">
      <div className="footer-content">
        <div className="footer-name">
          {selectedDecoration.name}
          {selectedDecoration.wikiTitle && (
            <a 
              className="wiki-link" 
              href={`https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(selectedDecoration.wikiTitle)}`}
              title="Wiki"
            >
              (wiki)
            </a>
          )}
        </div>
        <div className="footer-info">
          <div className="badge-container">{categoryNames}</div>
          {selectedDecoration.description && (
            <div className="footer-description">{selectedDecoration.description}</div>
          )}
        </div>
      </div>
    </div>
  );
};
