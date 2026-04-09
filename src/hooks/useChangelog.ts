import { useEffect, useState } from 'react';
import { ChangeLogData, ChangeLogDay, ChangeLogEntryType, ChangeLogFieldChange } from '../types';

const EMPTY_CHANGELOG: ChangeLogData = { days: [] };

const normalizeType = (value: unknown): ChangeLogEntryType | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'new item') return 'New Item';
  if (normalized === 'item update' || normalized === 'item updated') return 'Item Update';
  if (normalized === 'item removed') return 'Item Removed';
  if (normalized === 'image update' || normalized === 'image updated') return 'Image Update';
  if (normalized === 'recipe added') return 'Recipe Added';
  if (normalized === 'recipe updated' || normalized === 'recipe update') return 'Recipe Updated';
  return null;
};

const normalizeId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isValidFieldChange = (value: unknown): value is ChangeLogFieldChange => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { field?: unknown };
  return typeof candidate.field === 'string';
};

const normalizeDays = (raw: unknown): ChangeLogDay[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((day): day is { day: string; entries?: unknown } => Boolean(day) && typeof day === 'object' && typeof (day as { day?: unknown }).day === 'string')
    .map((day) => ({
      day: day.day,
      entries: Array.isArray(day.entries)
        ? day.entries
            .map((entry) => {
              if (!entry || typeof entry !== 'object') {
                return null;
              }
              const candidate = entry as { id?: unknown; type?: unknown; name?: unknown; changes?: unknown };
              const id = normalizeId(candidate.id);
              const type = normalizeType(candidate.type);
              if (id === null || type === null || typeof candidate.name !== 'string') {
                return null;
              }
              const changes = Array.isArray(candidate.changes)
                ? candidate.changes.filter(isValidFieldChange)
                : undefined;
              return { id, type, name: candidate.name, changes };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        : []
    }))
    .sort((a, b) => b.day.localeCompare(a.day));
};

export function useChangelog() {
  const [changelog, setChangelog] = useState<ChangeLogData>(EMPTY_CHANGELOG);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchChangelog = async () => {
      try {
        const baseUrl = process.env.PUBLIC_URL || '';
        const response = await fetch(`${baseUrl}/changelog.json`);

        if (!response.ok) {
          setChangelog(EMPTY_CHANGELOG);
          return;
        }

        const data = await response.json();
        setChangelog({
          days: normalizeDays((data as { days?: unknown }).days)
        });
      } catch (error) {
        console.error('Error fetching changelog:', error);
        setChangelog(EMPTY_CHANGELOG);
      } finally {
        setLoading(false);
      }
    };

    fetchChangelog();
  }, []);

  return {
    days: changelog.days,
    loading
  };
}
