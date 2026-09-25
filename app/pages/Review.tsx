// Review. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Review() {
  return (
    <div className="page">
      <PageHead title="Review" />
      <Empty title="Coming in the next release">Clips arrive here after a dump is cut. Approve all, reject all, delete or edit one.</Empty>
      <HelpButton guide="review-and-approve-clips" />
    </div>
  );
}
