import React, { useState, useRef, useEffect } from 'react';
import { Decoration, Category } from '../types';
import { ExpandedDecoration } from './ExpandedDecoration';

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
  const clickedItemRef = useRef<HTMLDivElement | null>(null);
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

  const scrollToItem = () => {
    if (clickedItemRef.current) {
      const headerHeight = 64; // Adjust this value based on your header height
      const itemPosition = clickedItemRef.current.getBoundingClientRect().top;
      const scrollPosition = window.pageYOffset + itemPosition - headerHeight - 30;
      
      window.scrollTo({
        top: scrollPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleItemClick = (decoration: Decoration) => {
    if (expandedItem === decoration.id) {
      setExpandedItem(null);
    } else {
      // If there's already an expanded item, close it first
      if (expandedItem !== null) {
        setExpandedItem(null);
        // Wait for the closing transition (300ms) before opening the new one
        setTimeout(() => {
          setExpandedItem(decoration.id);
          // Wait for the next frame to ensure the new expanded section is rendered
          requestAnimationFrame(() => {
            scrollToItem();
          });
        }, 0); // Match this with your CSS transition duration
      } else {
        setExpandedItem(decoration.id);
        // Wait for the expanding transition
        setTimeout(scrollToItem, 50);
      }
    }
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
                ref={decoration.id === expandedItem ? clickedItemRef : null}
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
                <ExpandedDecoration
                  decoration={expandedDecoration}
                  categories={categories}
                  itemsPerRow={itemsPerRow}
                  decorationIndex={decorations.findIndex(d => d.id === expandedItem)}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};