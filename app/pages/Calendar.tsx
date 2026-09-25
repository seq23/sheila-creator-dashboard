// Calendar. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Calendar() {
  return (
    <div className="page">
      <PageHead title="Calendar" />
      <Empty title="Coming in the next release">Approved clips fill the week at the best times, max 10 per channel.</Empty>
      <HelpButton guide="move-or-remove-a-post" />
    </div>
  );
}
