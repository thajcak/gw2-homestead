import React, { useState, useRef, useEffect } from 'react';
import { Decoration, Category } from '../types';

interface IconGridProps {
  decorations: Decoration[];
  categories: Category[];
  onDecorationHover: (decoration: Decoration) => void;
}

export const IconGrid: React.FC<IconGridProps> = ({
  decorations,
  categories,
  onDecorationHover
}) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [itemsPerRow, setItemsPerRow] = useState(0);

  // Calculate items per row on mount and window resize
  useEffect(() => {
    const calculateItemsPerRow = () => {
      if (gridRef.current) {
        const gridWidth = gridRef.current.offsetWidth;
        const itemWidth = 74; // icon width
        const gap = 16; // gap of 4 in Tailwind = 16px
        const calculatedItemsPerRow = Math.floor((gridWidth + gap) / (itemWidth + gap));
        setItemsPerRow(calculatedItemsPerRow);
      }
    };

    calculateItemsPerRow();
    window.addEventListener('resize', calculateItemsPerRow);
    return () => window.removeEventListener('resize', calculateItemsPerRow);
  }, []);

  const handleItemClick = (decoration: Decoration) => {
    setExpandedItem(expandedItem === decoration.id ? null : decoration.id);
  };

  const getRowNumber = (index: number) => {
    return Math.floor(index / itemsPerRow);
  };

  return (
    <div className="container mx-auto px-4 md:px-8 lg:px-16 py-8">
      <div 
        ref={gridRef}
        className="grid auto-rows-[74px] gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, 74px)`,
          justifyContent: 'center',
          gridAutoRows: '74px auto'
        }}
      >
        {decorations.map((decoration, index) => {
          const currentRow = getRowNumber(index);
          const expandedItemRow = expandedItem ? getRowNumber(decorations.findIndex(d => d.id === expandedItem)) : -1;
          const isLastInRow = (index + 1) % itemsPerRow === 0 || index === decorations.length - 1;
          const shouldRenderExpanded = currentRow === expandedItemRow && isLastInRow;
          const expandedDecoration = expandedItem ? decorations.find(d => d.id === expandedItem) : null;

          return (
            <React.Fragment key={decoration.id}>
              <div 
                className="relative w-74 h-74 cursor-pointer transition-transform hover:scale-105"
                onClick={() => handleItemClick(decoration)}
                onMouseEnter={() => onDecorationHover(decoration)}
              >
                <img
                  src={decoration.icon}
                  alt={decoration.name}
                  className="w-full h-full object-cover border-2 border-gray-300 rounded-lg"
                />
              </div>
              
              {shouldRenderExpanded && expandedDecoration && (
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
                      marginLeft: `calc(${(decorations.findIndex(d => d.id === expandedItem) % itemsPerRow) * (74 + 16)}px - ${(itemsPerRow * (74 + 16) - 16) / 2}px + 37px)`,
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
                          <h2 className="text-xl font-bold pr-32">{expandedDecoration.name}</h2>
                          {expandedDecoration.wikiTitle && (
                            <a
                              href={`https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(expandedDecoration.wikiTitle)}`}
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
                    <div className="flex justify-center">
                      <img
                        src={expandedDecoration.original?.source}
                        alt={expandedDecoration.name}
                        className="w-auto h-auto max-h-[50vh] object-contain"
                      />
                    </div>
                    <div className="flex justify-center flex-wrap gap-1.5 mt-4">
                          {expandedDecoration.categories.map(catId => {
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
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};