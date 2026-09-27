import { redirect } from 'next/navigation';

/** Kept so old links and bookmarks still land somewhere. */
export default function DashboardPage() {
  redirect('/learn');
}
