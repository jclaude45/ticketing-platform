import { EventNav } from '@/components/events/EventNav';

/** Every page of an event shares the event menu */
export default function EventLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EventNav />
      {children}
    </>
  );
}
