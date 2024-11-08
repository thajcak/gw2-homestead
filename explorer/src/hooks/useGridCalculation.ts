import { useState, useEffect } from 'react';

export function useGridCalculation(containerRef: React.RefObject<HTMLDivElement>) {
  const [itemsPerRow, setItemsPerRow] = useState(0);

  useEffect(() => {
    const calculateGrid = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const itemWidth = 74; // Width of each item
        const gap = 16; // 4 in Tailwind = 16px
        const calculatedItemsPerRow = Math.floor((containerWidth + gap) / (itemWidth + gap));
        setItemsPerRow(Math.max(1, calculatedItemsPerRow));
      }
    };

    calculateGrid();
    window.addEventListener('resize', calculateGrid);
    return () => window.removeEventListener('resize', calculateGrid);
  }, [containerRef]);

  return itemsPerRow;
}