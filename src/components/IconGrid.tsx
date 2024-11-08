import React, { useState, useRef, useEffect } from 'react';
import { Decoration, Category } from '../types';
import { ExpandedDecoration } from './ExpandedDecoration';
import { AnimatePresence } from 'framer-motion';

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
      const headerHeight = 64;
      const offset = 30;
      const itemTop = clickedItemRef.current.offsetTop;
      
      // Wait for the next frame to ensure DOM updates
      requestAnimationFrame(() => {
        window.scrollTo({
          top: itemTop - headerHeight - offset,
          behavior: 'smooth'
        });
      });
    }
  };

  const handleItemClick = (decoration: Decoration) => {
    const newIndex = decorations.findIndex(d => d.id === decoration.id);
    const currentIndex = decorations.findIndex(d => d.id === expandedItem);
    const isSameRow = Math.floor(newIndex / itemsPerRow) === Math.floor(currentIndex / itemsPerRow);

    if (expandedItem === decoration.id) {
      setExpandedItem(null);
    } else if (expandedItem !== null && isSameRow) {
      // Instantly switch without animation for same row
      setExpandedItem(decoration.id);
      requestAnimationFrame(scrollToItem);
    } else {
      if (expandedItem !== null) {
        setExpandedItem(null);
        setTimeout(() => {
          setExpandedItem(decoration.id);
          requestAnimationFrame(() => {
            requestAnimationFrame(scrollToItem);
          });
        }, 300);
      } else {
        setExpandedItem(decoration.id);
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollToItem);
        });
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
              
              <AnimatePresence>
                {shouldRenderExpanded && expandedDecoration && (
                  <ExpandedDecoration
                    decoration={expandedDecoration}
                    categories={categories}
                    itemsPerRow={itemsPerRow}
                    decorationIndex={decorations.findIndex(d => d.id === expandedItem)}
                  />
                )}
              </AnimatePresence>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};