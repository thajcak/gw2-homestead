import React from 'react';
import { Decoration, Category } from '../types';
import { motion } from 'framer-motion';

interface ExpandedDecorationProps {
  decoration: Decoration;
  categories: Category[];
  itemsPerRow: number;
  decorationIndex: number;
}

export const ExpandedDecoration: React.FC<ExpandedDecorationProps> = ({
  decoration,
  categories,
  itemsPerRow,
  decorationIndex,
}) => {
  // Calculate the indicator position
  const indicatorLeftPosition = `calc(${(decorationIndex % itemsPerRow) * (74 + 16)}px - ${(itemsPerRow * (74 + 16) - 16) / 2}px + 37px)`;
  
  // Calculate which row this item is in and set expanded content to appear in next row
  const rowIndex = Math.floor(decorationIndex / itemsPerRow) + 1;

  return (
    <motion.div 
      layoutId={`expanded-${decoration.id}`}
      className="expanded-decoration"
      style={{ gridRow: rowIndex + 1 }}
      initial={{ height: 0 }}
      animate={{ height: '70vh' }}
      exit={{ height: 0 }}
      transition={{ 
        duration: 0.3,
        ease: "easeOut",
        layout: { duration: 0.3 }
      }}
    >
      <div 
        className="decoration-indicator"
        style={{ marginLeft: indicatorLeftPosition }}
      />
      <div className="expanded-decoration-gradient">
        <div className="h-full flex flex-col">
          <div className="p-4">
            <div className="max-w-7xl mx-auto relative flex items-center justify-between">
              <h2 className="text-xl font-bold">{decoration.name}</h2>
              {decoration.wikiTitle && (
                <a
                  href={`https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(decoration.wikiTitle)}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Wiki →
                </a>
              )}
            </div>
          </div>

          <div className="flex-1 relative">
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <img
                src={decoration.original?.source ?? "https://static.staticwars.com/quaggans/lost.jpg"}
                alt={decoration.name}
                className="max-h-full w-auto object-contain"
                loading="eager"
              />
              {!decoration.original?.source && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <span className="text-white text-lg font-semibold">Image not found</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4">
            <div className="flex justify-center flex-wrap gap-1.5">
              {decoration.categories.map(catId => {
                const category = categories.find((cat: Category) => cat.id === catId);
                return category ? (
                  <span 
                    key={catId} 
                    className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300"
                  >
                    {category.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}; 