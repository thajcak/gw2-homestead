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
        <div className="h-full min-h-0 flex flex-col container mx-auto px-6">
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-x-0 px-4 md:px-8 lg:px-16">
            <div className="relative min-h-0 min-w-0 flex items-center justify-center py-4">
              <img
                src={decoration.original?.source ?? "https://static.staticwars.com/quaggans/lost.jpg"}
                alt={decoration.name}
                className="max-h-full max-w-full w-auto object-contain"
                loading="eager"
              />
              {!decoration.original?.source && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <span className="text-white text-lg font-semibold">Image not found</span>
                </div>
              )}
            </div>

            <div className="min-h-0 min-w-0 flex flex-col items-start text-left overflow-y-auto overflow-x-hidden py-4 lg:pl-4 lg:border-l lg:border-gray-700/60">
              <div className="w-full mb-3">
                <h2 className="text-xl font-bold break-words">{decoration.name}</h2>
                {decoration.wikiTitle && (
                  <a
                    href={`https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(decoration.wikiTitle)}`}
                    className="text-blue-400 hover:text-blue-300 transition-colors text-sm mt-2 inline-block"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on Wiki →
                  </a>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 justify-start w-full">
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
              <div className="w-full border-t border-gray-700/60 pt-3 mt-3">
              {decoration.recipe ? (
                <div className="text-sm text-gray-300 w-full space-y-2">
                  <div className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Recipe</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs w-full">
                    {decoration.recipe.rating != null ? (
                      <>
                        <dt className="text-gray-500">Rating</dt>
                        <dd>{decoration.recipe.rating}</dd>
                      </>
                    ) : null}
                    {decoration.recipe.sheet ? (
                      <>
                        <dt className="text-gray-500">Source</dt>
                        <dd className="break-words">{decoration.recipe.sheet}</dd>
                      </>
                    ) : null}
                  </dl>
                  {decoration.recipe.ingredients.length > 0 ? (
                    <ul className="text-xs space-y-0.5 w-full">
                      {decoration.recipe.ingredients.map((ing) => (
                        <li key={ing.slot} className="break-words">
                          {ing.quantity != null ? `${ing.quantity}× ` : ''}
                          {ing.item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No recipe data in catalog for this decoration.</p>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}; 