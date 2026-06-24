import { create } from 'zustand';
import type { Event, FilterState } from '@/types';

interface EventsState {
  selectedEvent: Event | null;
  filters: FilterState;
  currentPage: number;
  pageSize: number;
  setSelectedEvent: (event: Event | null) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  resetFilters: () => void;
}

const defaultFilters: FilterState = {
  search: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

export const useEventsStore = create<EventsState>((set) => ({
  selectedEvent: null,
  filters: defaultFilters,
  currentPage: 1,
  pageSize: 10,
  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters },
    currentPage: 1,
  })),
  setCurrentPage: (currentPage) => set({ currentPage }),
  setPageSize: (pageSize) => set({ pageSize, currentPage: 1 }),
  resetFilters: () => set({ filters: defaultFilters, currentPage: 1 }),
}));
