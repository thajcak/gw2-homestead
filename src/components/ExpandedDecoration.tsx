import React from 'react';
import { Decoration, Category } from '../types';

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
  return (
    <div 
      className="col-span-full text-white py-4 w-screen relative left-[50%] right-[50%] ml-[-50vw] mr-[-50vw]"
      style={{ 
        gridRow: 'span 8',
        minHeight: 'min-content',
        marginTop: '8px',
        marginBottom: '8px',
        background: `
          linear-gradient(to bottom, black 0%, rgb(31,41,55) 25%),
          linear-gradient(to top, black 0%, rgb(31,41,55) 25%),
          rgb(31,41,55)
        `
      }}
    >
      {/* Notch */}
      <div 
        className="absolute w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[12px] border-b-black -top-3"
        style={{
          left: '50%',
          marginLeft: `calc(${(decorationIndex % itemsPerRow) * (74 + 16)}px - ${(itemsPerRow * (74 + 16) - 16) / 2}px + 37px)`,
          transform: 'translateX(-50%)'
        }}
      />
      
      <div className="max-w-7xl mx-auto px-4">
        {/* Grid for text content only */}
        <div className="grid grid-cols-[minmax(auto,74px)] mb-4 gap-4" 
             style={{
               gridTemplateColumns: `repeat(${itemsPerRow}, 74px)`,
               justifyContent: 'center'
             }}>
          <div className="col-span-full">
            <div className="relative flex items-start">
              <h2 className="text-xl font-bold pr-32">{decoration.name}</h2>
              {decoration.wikiTitle && (
                <a
                  href={`https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(decoration.wikiTitle)}`}
                  className="text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap absolute right-0 top-[0.1rem]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Wiki →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Image outside of grid */}
        <div className="flex justify-center relative w-fit mx-auto">
          <img
            src={decoration.original?.source ?? "https://static.staticwars.com/quaggans/lost.jpg"}
            alt={decoration.name}
            className="w-auto h-auto max-h-[50vh] object-contain"
          />
          {!decoration.original?.source && (
            <div className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center bg-black bg-opacity-50">
              <span className="text-white text-lg font-semibold">Image not found</span>
            </div>
          )}
        </div>
        <div className="flex justify-center flex-wrap gap-1.5 mt-4">
          {decoration.categories.map(catId => {
            const category = categories.find((cat: Category) => cat.id === catId);
            return category ? (
              <span key={catId} className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-300">
                {category.name}
              </span>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}; 