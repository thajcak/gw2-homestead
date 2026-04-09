import React from 'react';
import { ChangeLogDay, ChangeLogEntryType } from '../types';

const PANEL_MAX_WIDTH_PX = 500;
const ENTRY_TYPE_ORDER: ChangeLogEntryType[] = ['New Item', 'Item Update', 'Item Removed', 'Image Update'];

interface ChangeLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onEntryClick: (id: number, name: string) => void;
  days: ChangeLogDay[];
  loading: boolean;
  scrollTop: number;
  onScrollTopSave: (scrollTop: number) => void;
}

export const ChangeLogPanel: React.FC<ChangeLogPanelProps> = ({
  isOpen,
  onClose,
  onEntryClick,
  days,
  loading,
  scrollTop,
  onScrollTopSave
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const previousIsOpenRef = React.useRef<boolean>(false);
  const [visibleTypes, setVisibleTypes] = React.useState<Set<ChangeLogEntryType>>(
    () => new Set(ENTRY_TYPE_ORDER)
  );

  const captureScrollTop = React.useCallback(() => {
    if (scrollContainerRef.current) {
      onScrollTopSave(scrollContainerRef.current.scrollTop);
    }
  }, [onScrollTopSave]);

  const handleClose = React.useCallback(() => {
    captureScrollTop();
    onClose();
  }, [captureScrollTop, onClose]);

  const handleEntryClick = React.useCallback((id: number, name: string) => {
    captureScrollTop();
    onEntryClick(id, name);
  }, [captureScrollTop, onEntryClick]);

  const scrollToTop = React.useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const toggleTypeVisibility = React.useCallback((entryType: ChangeLogEntryType) => {
    setVisibleTypes((previous) => {
      const next = new Set(previous);
      if (next.has(entryType)) {
        next.delete(entryType);
      } else {
        next.add(entryType);
      }
      return next;
    });
  }, []);

  React.useEffect(() => {
    const wasOpen = previousIsOpenRef.current;
    previousIsOpenRef.current = isOpen;

    // Restore scroll only when transitioning from closed -> open.
    if (!wasOpen && isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollTop;
    }
  }, [isOpen, scrollTop]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[200]">
      <button
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-label="Close recent changes panel"
      />

      <aside
        className="absolute right-0 top-0 h-full bg-white shadow-2xl z-[210] border-l border-gray-200"
        style={{ width: `${PANEL_MAX_WIDTH_PX}px`, maxWidth: '90vw' }}
        role="dialog"
        aria-modal="true"
        aria-label="Recent Changes"
      >
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={scrollToTop}
              className="text-lg font-semibold text-gray-900 cursor-pointer"
              aria-label="Scroll changelog to top"
            >
              Recent Changes
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={scrollToTop}
                className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                aria-label="Scroll to top"
              >
                To Top
              </button>
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-800 text-xl leading-none"
                aria-label="Close panel"
              >
                ×
              </button>
            </div>
          </div>
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {ENTRY_TYPE_ORDER.map((entryType) => {
              const isVisible = visibleTypes.has(entryType);
              return (
                <button
                  key={entryType}
                  onClick={() => toggleTypeVisibility(entryType)}
                  className={`text-xs px-2 py-1 rounded border ${
                    isVisible
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                  aria-pressed={isVisible}
                >
                  {entryType}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="h-[calc(100%-97px)] overflow-y-auto px-4 py-3"
        >
          {loading && <p className="text-sm text-gray-500">Loading changes...</p>}
          {!loading && days.length === 0 && (
            <p className="text-sm text-gray-500">No recent changes yet.</p>
          )}

          {!loading &&
            days.map((dayGroup) => {
              const visibleEntryCount = dayGroup.entries.filter((entry) => visibleTypes.has(entry.type)).length;
              if (visibleEntryCount === 0) {
                return null;
              }

              return (
                <section key={dayGroup.day} className="mb-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">{dayGroup.day}</h3>
                  {ENTRY_TYPE_ORDER.map((entryType) => {
                    if (!visibleTypes.has(entryType)) {
                      return null;
                    }

                    const entriesForType = dayGroup.entries.filter((entry) => entry.type === entryType);

                    if (entriesForType.length === 0) {
                      return null;
                    }

                    return (
                      <div key={`${dayGroup.day}-${entryType}`} className="mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                          {entryType}
                        </h4>
                        {(entryType === 'New Item' || entryType === 'Image Update') ? (
                          <ul className="flex flex-wrap gap-1.5">
                            {entriesForType.map((entry, index) => (
                              <li key={`${dayGroup.day}-${entry.type}-${entry.id}-${index}`}>
                                <button
                                  className="inline-flex text-left text-sm text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
                                  onClick={() => handleEntryClick(entry.id, entry.name)}
                                >
                                  {entry.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <ul className="space-y-1.5">
                            {entriesForType.map((entry, index) => (
                              <li key={`${dayGroup.day}-${entry.type}-${entry.id}-${index}`}>
                                <button
                                  className="w-full text-left text-sm text-gray-700 border border-gray-100 rounded px-2 py-1.5 hover:bg-gray-50"
                                  onClick={() => handleEntryClick(entry.id, entry.name)}
                                >
                                  <div>{entry.name}</div>
                                  {entry.type === 'Item Update' && entry.changes && entry.changes.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                                      {entry.changes.slice(0, 3).map((change, changeIndex) => (
                                        <li key={`${entry.id}-${change.field}-${changeIndex}`}>
                                          {change.detail
                                            ? change.detail
                                            : `${change.field}: ${JSON.stringify(change.before)} -> ${JSON.stringify(change.after)}`}
                                        </li>
                                      ))}
                                      {entry.changes.length > 3 && (
                                        <li>+{entry.changes.length - 3} more</li>
                                      )}
                                    </ul>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
        </div>
      </aside>
    </div>
  );
};
